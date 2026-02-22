package com.pdfforms.service;

import com.pdfforms.dto.AnalyzePdfResponse;
import com.pdfforms.dto.DetectedFieldDto;
import com.pdfforms.dto.FieldRequest;
import com.pdfforms.model.*;
import lombok.extern.slf4j.Slf4j;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.cos.COSArray;
import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.cos.COSString;
import org.apache.pdfbox.io.RandomAccessReadBuffer;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotation;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationWidget;
import org.apache.pdfbox.pdmodel.interactive.digitalsignature.PDSignature;
import org.apache.pdfbox.pdmodel.interactive.digitalsignature.SignatureOptions;
import org.apache.pdfbox.pdmodel.interactive.form.*;
import org.bouncycastle.cert.jcajce.JcaCertStore;
import org.bouncycastle.cms.CMSProcessableByteArray;
import org.bouncycastle.cms.CMSSignedData;
import org.bouncycastle.cms.CMSSignedDataGenerator;
import org.bouncycastle.cms.jcajce.JcaSignerInfoGeneratorBuilder;
import org.bouncycastle.operator.ContentSigner;
import org.bouncycastle.operator.jcajce.JcaContentSignerBuilder;
import org.bouncycastle.operator.jcajce.JcaDigestCalculatorProviderBuilder;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.security.PrivateKey;
import java.security.cert.X509Certificate;
import java.util.*;

@Slf4j
@Service
public class PdfBoxService {

    /**
     * Extrait les champs AcroForm d'un PDF existant.
     * Retourne une liste de DetectedFieldDto avec les coordonnées PDF (origine bas-gauche).
     *
     * @param pdfBytes bytes du PDF à analyser
     * @return AnalyzePdfResponse contenant la liste des champs détectés
     */
    public AnalyzePdfResponse extractFields(byte[] pdfBytes) throws IOException {
        try (PDDocument doc = Loader.loadPDF(new RandomAccessReadBuffer(pdfBytes))) {
            PDAcroForm acroForm = doc.getDocumentCatalog().getAcroForm();
            if (acroForm == null) {
                log.debug("PDF sans AcroForm — aucun champ à extraire.");
                return new AnalyzePdfResponse(List.of());
            }

            // Index page → numéro (0-based)
            Map<PDPage, Integer> pageIndex = new HashMap<>();
            int idx = 0;
            for (PDPage page : doc.getPages()) pageIndex.put(page, idx++);

            List<DetectedFieldDto> result = new ArrayList<>();
            Set<String> usedNames = new HashSet<>();
            int unnamedCount = 0;

            for (PDField field : acroForm.getFieldTree()) {
                String fieldType = detectFieldType(field);
                if (fieldType == null) continue;

                String groupName = "radio".equals(fieldType) ? field.getPartialName() : null;
                List<PDAnnotationWidget> widgets = field.getWidgets();
                if (widgets == null || widgets.isEmpty()) continue;

                for (int i = 0; i < widgets.size(); i++) {
                    PDAnnotationWidget widget = widgets.get(i);
                    PDRectangle rect = widget.getRectangle();
                    if (rect == null) continue;

                    int page = pageIndex.getOrDefault(widget.getPage(), 0);

                    // Nom unique
                    String baseName = field.getFullyQualifiedName();
                    if (baseName == null || baseName.isBlank()) {
                        baseName = fieldType + "_imported_" + (unnamedCount++);
                    }
                    String fieldName = widgets.size() > 1 ? baseName + "_" + i : baseName;
                    // Dédoublonnage
                    if (usedNames.contains(fieldName)) fieldName = fieldName + "_" + System.nanoTime();
                    usedNames.add(fieldName);

                    result.add(DetectedFieldDto.builder()
                            .fieldName(fieldName)
                            .fieldType(fieldType)
                            .page(page)
                            .x(rect.getLowerLeftX())
                            .y(rect.getLowerLeftY())
                            .width(rect.getWidth())
                            .height(rect.getHeight())
                            .groupName(groupName)
                            .build());
                }
            }

            log.info("PDF analysé : {} champ(s) AcroForm détecté(s).", result.size());
            return new AnalyzePdfResponse(result);
        }
    }

    private String detectFieldType(PDField field) {
        if (field instanceof PDTextField) return "text";
        if (field instanceof PDCheckBox) return "checkbox";
        if (field instanceof PDRadioButton) return "radio";
        return null; // PDComboBox, PDListBox, PDSignatureField → ignorés
    }

    /**
     * Crée le PDF master avec les champs AcroForm positionnés.
     * Chaque champ reçoit une annotation /Assign dans son COSObject.
     *
     * @param originalPdfBytes bytes du PDF original uploadé
     * @param fields           liste des champs à créer
     * @return bytes du PDF master avec les champs AcroForm
     */
    public byte[] createMasterPdf(byte[] originalPdfBytes, List<FieldRequest> fields) throws IOException {
        try (PDDocument doc = Loader.loadPDF(new RandomAccessReadBuffer(originalPdfBytes))) {

            // Supprimer les annotations widget de l'AcroForm original pour éviter les widgets
            // orphelins qui invalident la signature (le /Parent référence un champ supprimé).
            for (PDPage page : doc.getPages()) {
                List<PDAnnotation> annots = page.getAnnotations();
                annots.removeIf(a -> a instanceof PDAnnotationWidget);
                page.setAnnotations(annots);
            }

            // Créer le nouvel AcroForm (remplace l'ancien)
            PDAcroForm acroForm = new PDAcroForm(doc);
            doc.getDocumentCatalog().setAcroForm(acroForm);

            // Configurer la police par défaut (Helvetica standard)
            PDType1Font helvetica = new PDType1Font(Standard14Fonts.FontName.HELVETICA);
            PDResources defaultResources = new PDResources();
            defaultResources.put(COSName.getPDFName("Helv"), helvetica);
            acroForm.setDefaultResources(defaultResources);

            // NeedAppearances = true : les visionneuses PDF et PDFBox generateAppearances()
            // génèrent les apparences visuelles (indispensable pour les cases à cocher)
            acroForm.setNeedAppearances(true);

            List<PDField> acroFields = new ArrayList<>();

            for (FieldRequest field : fields) {
                PDPage page = doc.getPage(field.getPage());
                String fieldType = field.getFieldType() != null ? field.getFieldType() : "text";

                // Tous les types de champs sont représentés comme PDTextField.
                // PDCheckBox nécessite des streams d'apparence (/AP) explicites pour être
                // rendu correctement par tous les viewers PDF, même avec NeedAppearances=true.
                // La sémantique checkbox/radio est portée par /FieldType dans le COSObject,
                // et les valeurs "true"/"false" sont converties en texte dans applyFieldValues.
                PDTextField textField = new PDTextField(acroForm);
                textField.setPartialName(field.getFieldName());

                // Police auto-size (0) pour checkbox/radio (petits champs),
                // taille fixe 10pt pour les champs texte
                boolean isToggle = "checkbox".equals(fieldType) || "radio".equals(fieldType);
                textField.setDefaultAppearance(isToggle ? "/Helv 0 Tf 0 g" : "/Helv 10 Tf 0 g");

                PDAnnotationWidget widget = textField.getWidgets().get(0);
                widget.setRectangle(new PDRectangle(
                        (float) field.getX(),
                        (float) field.getY(),
                        (float) field.getWidth(),
                        (float) field.getHeight()
                ));
                widget.setPage(page);
                widget.setPrinted(true);
                page.getAnnotations().add(widget);

                // /Assign : ownership verification
                textField.getCOSObject().setString(
                        COSName.getPDFName("Assign"),
                        field.getAssignedTo()
                );
                // /FieldType : pour la conversion de valeur dans applyFieldValues
                textField.getCOSObject().setString(
                        COSName.getPDFName("FieldType"),
                        fieldType
                );

                acroFields.add(textField);
                log.debug("Champ créé : {} (type={}) assigné à {} à ({},{}) {}x{}",
                        field.getFieldName(), fieldType, field.getAssignedTo(),
                        field.getX(), field.getY(), field.getWidth(), field.getHeight());
            }

            acroForm.setFields(acroFields);

            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            doc.save(bos);
            log.info("PDF master créé avec {} champs AcroForm.", fields.size());
            return bos.toByteArray();
        }
    }

    /**
     * Génère une version aplatie (flattened) du master PDF.
     * Les champs AcroForm sont rendus visuellement et supprimés du formulaire.
     * Le résultat est un PDF non-interactif montrant les valeurs actuelles.
     *
     * @param masterPdfBytes bytes du PDF master
     * @return bytes du PDF aplati
     */
    public byte[] flattenPdf(byte[] masterPdfBytes) throws IOException {
        try (PDDocument doc = Loader.loadPDF(new RandomAccessReadBuffer(masterPdfBytes))) {
            PDAcroForm acroForm = doc.getDocumentCatalog().getAcroForm();
            if (acroForm != null) {
                // NeedAppearances(true) déclenche generateAppearances() dans flatten(),
                // ce qui est nécessaire pour rendre correctement les cases à cocher.
                acroForm.setNeedAppearances(true);
                acroForm.flatten();
            }
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            doc.save(bos);
            log.debug("PDF aplati généré ({} bytes).", bos.size());
            return bos.toByteArray();
        }
    }

    /**
     * Applique les valeurs de champs dans le PDF master.
     * Vérifie que chaque champ appartient bien au signataire attendu via /Assign.
     *
     * @param masterPdfBytes bytes du PDF master
     * @param fields         fields definitions to update
     * @return bytes du PDF master mis à jour
     */
    public byte[] applyFieldValues(byte[] masterPdfBytes,
                                   List<FieldDefinition> fields) throws IOException {
        try (PDDocument doc = Loader.loadPDF(new RandomAccessReadBuffer(masterPdfBytes))) {
            PDAcroForm acroForm = doc.getDocumentCatalog().getAcroForm();
            if (acroForm == null) {
                throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,
                        "Aucun AcroForm dans le PDF master.");
            }

            for (FieldDefinition fieldDef : fields) {
                String fieldName = fieldDef.getFieldName();
                String value = fieldDef.getCurrentValue();

                PDField field = acroForm.getField(fieldName);
                if (field == null) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                            "Champ introuvable : " + fieldName);
                }

                if (field instanceof PDTextField textField) {
                    // Lire le type stocké dans le COSObject pour savoir comment convertir la valeur
                    String storedFieldType = field.getCOSObject()
                            .getString(COSName.getPDFName("FieldType"));
                    boolean isToggle = "checkbox".equals(storedFieldType)
                            || "radio".equals(storedFieldType);

                    if (isToggle) {
                        // "true" → "X" (visible dans tous les viewers PDF)
                        // "false" → "" (champ vide, non sélectionné)
                        boolean checked = "true".equalsIgnoreCase(value);
                        textField.setValue(checked ? "X" : "");
                        log.debug("Champ toggle appliqué : {} ({}) = {}", fieldName, storedFieldType, checked);
                    } else {
                        textField.setValue(value);
                        log.debug("Valeur texte appliquée : {} = '{}'", fieldName, value);
                    }
                    textField.setReadOnly(true);
                }
            }

            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            doc.saveIncremental(bos);
            return bos.toByteArray();
        }
    }

    /**
     * Signe le PDF master de manière incrémentale avec le certificat de l'application.
     * Utilise PDFBox + BouncyCastle pour générer une signature PKCS#7 détachée.
     *
     * @param masterPdfBytes bytes du PDF master
     * @param signature signature information
     * @return bytes du PDF master signé (avec l'incrément de signature)
     */
    public byte[] signPdf(byte[] masterPdfBytes, Signature signature) throws Exception {
        try (PDDocument doc = Loader.loadPDF(new RandomAccessReadBuffer(masterPdfBytes))) {
            PDSignature pdSignature = new PDSignature();
            pdSignature.setFilter(PDSignature.FILTER_ADOBE_PPKLITE);
            pdSignature.setSubFilter(PDSignature.SUBFILTER_ADBE_PKCS7_DETACHED);
            pdSignature.setName("PDF Forms POC %s".formatted(signature.getSignerName()));
            pdSignature.setReason("Signature %s".formatted(signature.getSignerName()));
            pdSignature.setSignDate(Calendar.getInstance());

            if (signature instanceof CertificationSignature certificationSignature) {
                setFormFillPermission(pdSignature, certificationSignature.getPermissionLevel());
            }

            if (signature instanceof ApprovalSignature approvalSignature) {
                lockFields(pdSignature, approvalSignature.getFieldToLock());
            }

            SignatureOptions options = new SignatureOptions();
            options.setPreferredSignatureSize(0x2500); // ~9Ko réservé pour la pdSignature

            var acroForm = doc.getDocumentCatalog().getAcroForm();
            if (acroForm != null) {
                acroForm.setNeedAppearances(false);
            }

            doc.addSignature(pdSignature, (InputStream content) -> {
                try {
                    return createCmsSignature(content, signature.getPrivateKey(), signature.getCertificate());
                } catch (Exception e) {
                    throw new IOException("Échec de la génération de la pdSignature CMS", e);
                }
            }, options);

            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            doc.saveIncremental(bos);
            log.info("PDF signé avec saveIncremental ({} bytes).", bos.size());
            return bos.toByteArray();
        }
    }

    private void setFormFillPermission(PDSignature signature, SignaturePermissionLevel permissionLevel) {
        // Définir les permissions MDP (P=2 : champs AcroForm modifiables)
        COSDictionary transformParams = new COSDictionary();
        transformParams.setItem(COSName.TYPE, COSName.getPDFName("TransformParams"));
        transformParams.setInt(COSName.P, permissionLevel.getLevel());
        transformParams.setName(COSName.V, "1.2");

        COSDictionary reference = new COSDictionary();
        reference.setItem(COSName.TYPE, COSName.getPDFName("SigRef"));
        reference.setItem(COSName.getPDFName("TransformMethod"), COSName.getPDFName("DocMDP"));
        reference.setItem(COSName.getPDFName("TransformParams"), transformParams);

        COSArray referenceArray = new COSArray();
        referenceArray.add(reference);
        signature.getCOSObject().setItem(COSName.getPDFName("Reference"), referenceArray);
    }

    private void lockFields(PDSignature signature, List<String> fieldsToLock) {
        COSDictionary transformParams = new COSDictionary();
        transformParams.setName(COSName.TYPE, "TransformParams");
        transformParams.setName(COSName.getPDFName("Action"), "Include");
        transformParams.setName(COSName.V, "1.2");

        COSArray fields = new COSArray();
        fieldsToLock.forEach(f -> fields.add(new COSString(f)));
        transformParams.setItem(COSName.getPDFName("Fields"), fields);

        COSDictionary reference = new COSDictionary();
        reference.setName(COSName.TYPE, "SigRef");
        reference.setName(COSName.getPDFName("TransformMethod"), "FieldMDP");
        reference.setItem(COSName.getPDFName("TransformParams"), transformParams);

        COSArray referenceArray = new COSArray();
        referenceArray.add(reference);

        signature.getCOSObject().setItem(COSName.getPDFName("Reference"), referenceArray);
    }

    /**
     * Génère une signature CMS/PKCS#7 détachée sur le contenu fourni.
     */
    private byte[] createCmsSignature(InputStream content,
                                      PrivateKey privateKey,
                                      X509Certificate certificate) throws Exception {
        byte[] data = content.readAllBytes();

        List<X509Certificate> certList = Collections.singletonList(certificate);
        JcaCertStore certStore = new JcaCertStore(certList);

        ContentSigner contentSigner = new JcaContentSignerBuilder("SHA256withRSA")
                .setProvider("BC")
                .build(privateKey);

        CMSSignedDataGenerator gen = new CMSSignedDataGenerator();
        gen.addSignerInfoGenerator(
                new JcaSignerInfoGeneratorBuilder(
                        new JcaDigestCalculatorProviderBuilder().setProvider("BC").build()
                ).build(contentSigner, certificate)
        );
        gen.addCertificates(certStore);

        CMSProcessableByteArray processable = new CMSProcessableByteArray(data);
        CMSSignedData signedData = gen.generate(processable, false); // false = signature détachée
        return signedData.getEncoded();
    }
}
