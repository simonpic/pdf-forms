package com.pdfforms.service;

import com.pdfforms.dto.AnalyzePdfResponse;
import com.pdfforms.dto.DetectedFieldDto;
import com.pdfforms.dto.FieldRequest;
import com.pdfforms.dto.SignaturePlacement;
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
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotation;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationWidget;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAppearanceDictionary;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAppearanceStream;
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
import org.springframework.util.CollectionUtils;
import org.springframework.web.server.ResponseStatusException;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.security.PrivateKey;
import java.security.cert.X509Certificate;
import java.text.SimpleDateFormat;
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
     * Applique les valeurs de champs sur un PDDocument ouvert.
     * Le contrôle d'ownership est effectué en amont par WorkflowService (source : MongoDB).
     * Les streams d'apparence (/AP) sont générés immédiatement par PDFBox à chaque setValue().
     *
     * @param doc    document ouvert sur lequel appliquer les valeurs
     * @param fields champs à mettre à jour (appartiennent tous au même signataire)
     */
    private void applyFieldValues(PDDocument doc,
                                  List<FieldDefinition> fields) throws IOException {
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
    }

    /**
     * Remplit les champs AcroForm et signe le PDF en une seule passe saveIncremental.
     * Si {@code fields} est vide ou null, seule la signature est ajoutée.
     * Utilise PDFBox + BouncyCastle pour générer une signature PKCS#7 détachée.
     *
     * @param masterPdfBytes bytes du PDF master
     * @param signature      informations de signature (type, clé, certificat)
     * @param fields         champs à remplir avant de signer (peut être null ou vide)
     * @param placement      position choisie par le signataire (null → position par défaut)
     * @return bytes du PDF mis à jour et signé (incrément PDF)
     */
    public byte[] signPdf(byte[] masterPdfBytes, Signature signature,
                          List<FieldDefinition> fields, SignaturePlacement placement) throws Exception {
        try (PDDocument doc = Loader.loadPDF(new RandomAccessReadBuffer(masterPdfBytes))) {
            if (!CollectionUtils.isEmpty(fields)) {
                applyFieldValues(doc, fields);
            }

            PDSignature pdSignature = new PDSignature();
            pdSignature.setFilter(PDSignature.FILTER_ADOBE_PPKLITE);
            pdSignature.setSubFilter(PDSignature.SUBFILTER_ADBE_PKCS7_DETACHED);
            pdSignature.setName("PDF Forms POC %s".formatted(signature.getSignerName()));
            pdSignature.setReason("Signature %s".formatted(signature.getSignerName()));
            pdSignature.setSignDate(Calendar.getInstance());

            if (signature instanceof CertificationSignature certificationSignature) {
                setFormFillPermission(pdSignature, certificationSignature.getPermissionLevel());
            }

            if (signature instanceof ApprovalSignature approvalSignature &&
                    !CollectionUtils.isEmpty(approvalSignature.getFieldToLock())) {
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

            // L'apparence est appliquée APRÈS addSignature() pour travailler sur le champ
            // réel que PDFBox vient de créer/remplir. Entre addSignature() et saveIncremental()
            // les modifications sont incluses dans la même révision et couvertes par le byte range.
            applySignatureAppearance(doc, pdSignature, signature.getSignerName(), placement);

            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            doc.saveIncremental(bos);
            log.info("PDF signé avec saveIncremental ({} bytes).", bos.size());
            return bos.toByteArray();
        }
    }

    /**
     * Retrouve le champ de signature que PDFBox vient de créer dans {@code addSignature()},
     * le repositionne en bas à droite de la dernière page, et lui applique l'apparence visuelle.
     * <p>
     * Cette méthode doit être appelée <strong>après</strong> {@code doc.addSignature()} et
     * <strong>avant</strong> {@code doc.saveIncremental()} : les modifications sont ainsi
     * incluses dans la même révision PDF et couvertes par le byte range de la signature.
     * <p>
     * Stratégie de recherche : PDFBox définit {@code /V = pdSignature.getCOSObject()} sur le
     * champ qu'il crée. On cherche ce champ par égalité de référence Java sur le COSObject.
     *
     * @param doc         document courant
     * @param pdSignature objet PDSignature dont on cherche le champ associé
     * @param signerName  nom du signataire à afficher dans l'apparence
     */
    private void applySignatureAppearance(PDDocument doc, PDSignature pdSignature,
                                          String signerName, SignaturePlacement placement) throws IOException {
        PDAcroForm acroForm = doc.getDocumentCatalog().getAcroForm();
        if (acroForm == null) {
            log.warn("AcroForm absent après addSignature() — apparence de signature ignorée.");
            return;
        }

        // Trouver le champ dont /V pointe vers notre PDSignature (référence Java identique)
        PDSignatureField sigField = null;
        for (PDField field : acroForm.getFieldTree()) {
            if (field instanceof PDSignatureField sf
                    && pdSignature.getCOSObject() == sf.getCOSObject().getDictionaryObject(COSName.V)) {
                sigField = sf;
                break;
            }
        }
        if (sigField == null) {
            log.warn("Champ de signature introuvable après addSignature() — apparence ignorée.");
            return;
        }

        // Pas de placement → signature de certification platform (pas d'apparence visuelle)
        if (placement == null) {
            log.debug("Pas de placement fourni — apparence ignorée (signature platform).");
            return;
        }

        int pageIndex = Math.max(0, Math.min(placement.getPage(), doc.getNumberOfPages() - 1));
        PDPage targetPage = doc.getPage(pageIndex);
        float sigX = (float) placement.getX();
        float sigY = (float) placement.getY();
        float sigW = (float) placement.getWidth();
        float sigH = (float) placement.getHeight();

        PDAnnotationWidget widget = sigField.getWidgets().get(0);

        // PDFBox crée le champ avec un rectangle invisible (0,0,0,0) sur une page.
        // On le retire de sa page courante (si présente) avant de le replacer sur la cible.
        PDPage currentPage = widget.getPage();
        if (currentPage != null && currentPage != targetPage) {
            List<PDAnnotation> annots = new ArrayList<>(currentPage.getAnnotations());
            annots.removeIf(a -> a.getCOSObject() == widget.getCOSObject());
            currentPage.setAnnotations(annots);
        }

        widget.getCOSObject().setItem(COSName.SUBTYPE, COSName.getPDFName("Widget"));
        widget.setRectangle(new PDRectangle(sigX, sigY, sigW, sigH));
        widget.setPage(targetPage);
        widget.setPrinted(true);

        // Ajouter à la page cible si pas encore présent
        List<PDAnnotation> targetAnnots = new ArrayList<>(targetPage.getAnnotations());
        boolean alreadyInPage = targetAnnots.stream()
                .anyMatch(a -> a.getCOSObject() == widget.getCOSObject());
        if (!alreadyInPage) {
            targetAnnots.add(widget);
            targetPage.setAnnotations(targetAnnots);
        }

        buildSignatureAppearance(doc, widget, signerName, sigW, sigH);
        log.debug("Apparence appliquée pour '{}' à ({}, {}) {}x{} (page {})",
                signerName, sigX, sigY, sigW, sigH,
                placement != null ? placement.getPage() : doc.getNumberOfPages() - 1);
    }

    /**
     * Construit l'apparence visuelle d'un champ de signature via l'API PDFBox.
     * <p>
     * Le dessin est effectué avec {@link PDPageContentStream} sur un document temporaire,
     * ce qui délègue à PDFBox l'encodage des polices et des caractères (accents inclus).
     * Les bytes du content stream résultant sont ensuite copiés dans le
     * {@link PDAppearanceStream} du document principal.
     * <p>
     * Le même objet {@link PDResources} est partagé entre la page temporaire et
     * l'appearance stream : PDFBox affecte les noms de ressources polices (/F0, /F1…)
     * lors des appels {@code setFont()}, et ces mêmes noms sont utilisés dans les bytes
     * copiés, garantissant la cohérence.
     *
     * @param doc        document principal (destination de l'appearance stream)
     * @param widget     widget de l'annotation de signature
     * @param signerName nom du signataire
     * @param width      largeur du rectangle en points PDF
     * @param height     hauteur du rectangle en points PDF
     */
    private void buildSignatureAppearance(PDDocument doc, PDAnnotationWidget widget,
                                          String signerName, float width, float height) throws IOException {
        PDType1Font fontBold    = new PDType1Font(Standard14Fonts.FontName.HELVETICA_BOLD);
        PDType1Font fontRegular = new PDType1Font(Standard14Fonts.FontName.HELVETICA);
        String dateStr = new SimpleDateFormat("dd/MM/yyyy HH:mm", Locale.FRANCE).format(new Date());

        // PDResources partagé : PDFBox y enregistre les polices au fil des setFont(),
        // puis l'appearance stream référence les mêmes clés.
        PDResources resources = new PDResources();
        byte[] contentBytes;

        try (PDDocument tempDoc = new PDDocument()) {
            PDPage tempPage = new PDPage(new PDRectangle(width, height));
            tempPage.setResources(resources);
            tempDoc.addPage(tempPage);

            try (PDPageContentStream cs = new PDPageContentStream(tempDoc, tempPage)) {
                // Fond bleu clair
                cs.setNonStrokingColor(0.93f, 0.95f, 0.98f);
                cs.addRect(0, 0, width, height);
                cs.fill();

                // Barre d'accent gauche (bleu)
                cs.setNonStrokingColor(0.25f, 0.41f, 0.68f);
                cs.addRect(0, 0, 4, height);
                cs.fill();

                // Contour bleu
                cs.setStrokingColor(0.25f, 0.41f, 0.68f);
                cs.setLineWidth(0.8f);
                cs.addRect(0.4f, 0.4f, width - 0.8f, height - 0.8f);
                cs.stroke();

                // Label "Signé par" en gris
                cs.setNonStrokingColor(0.50f, 0.50f, 0.50f);
                cs.beginText();
                cs.setFont(fontRegular, 7);
                cs.newLineAtOffset(8, height - 14f);
                cs.showText("Signé par");
                cs.endText();

                // Nom du signataire en bleu gras
                cs.setNonStrokingColor(0.15f, 0.25f, 0.50f);
                cs.beginText();
                cs.setFont(fontBold, 10);
                cs.newLineAtOffset(8, height - 27f);
                cs.showText(signerName);
                cs.endText();

                // Date en gris
                cs.setNonStrokingColor(0.50f, 0.50f, 0.50f);
                cs.beginText();
                cs.setFont(fontRegular, 7);
                cs.newLineAtOffset(8, 7);
                cs.showText(dateStr);
                cs.endText();
            }

            try (InputStream is = tempPage.getContents()) {
                contentBytes = is.readAllBytes();
            }
        }

        PDAppearanceStream ap = new PDAppearanceStream(doc);
        ap.setResources(resources);
        ap.setBBox(new PDRectangle(width, height));

        try (OutputStream os = ap.getCOSObject().createOutputStream(COSName.FLATE_DECODE)) {
            os.write(contentBytes);
        }

        PDAppearanceDictionary appearanceDict = new PDAppearanceDictionary();
        appearanceDict.setNormalAppearance(ap);
        widget.setAppearance(appearanceDict);
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
