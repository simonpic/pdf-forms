package com.pdfforms.service;

import com.pdfforms.dto.AnalyzePdfResponse;
import com.pdfforms.dto.DetectedFieldDto;
import com.pdfforms.dto.FieldRequest;
import lombok.extern.slf4j.Slf4j;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.io.RandomAccessReadBuffer;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationWidget;
import org.apache.pdfbox.pdmodel.interactive.digitalsignature.PDSignature;
import org.apache.pdfbox.pdmodel.interactive.digitalsignature.SignatureOptions;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.apache.pdfbox.pdmodel.interactive.form.PDCheckBox;
import org.apache.pdfbox.pdmodel.interactive.form.PDField;
import org.apache.pdfbox.pdmodel.interactive.form.PDRadioButton;
import org.apache.pdfbox.pdmodel.interactive.form.PDTextField;
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
import java.text.Normalizer;
import java.text.SimpleDateFormat;
import java.util.*;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Set;

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
        if (field instanceof PDTextField)  return "text";
        if (field instanceof PDCheckBox)   return "checkbox";
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

            // Créer ou récupérer l'AcroForm
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
     * @param masterPdfBytes   bytes du PDF master
     * @param fieldValues      map fieldName -> valeur
     * @param expectedSignerId signerId du signataire autorisé
     * @return bytes du PDF master mis à jour
     */
    public byte[] applyFieldValues(byte[] masterPdfBytes,
                                   Map<String, String> fieldValues,
                                   String expectedSignerId) throws IOException {
        try (PDDocument doc = Loader.loadPDF(new RandomAccessReadBuffer(masterPdfBytes))) {
            PDAcroForm acroForm = doc.getDocumentCatalog().getAcroForm();
            if (acroForm == null) {
                throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,
                        "Aucun AcroForm dans le PDF master.");
            }

            for (Map.Entry<String, String> entry : fieldValues.entrySet()) {
                String fieldName = entry.getKey();
                String value = entry.getValue();

                PDField field = acroForm.getField(fieldName);
                if (field == null) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                            "Champ introuvable : " + fieldName);
                }

                // Vérifier via /Assign que ce champ appartient au signataire
                String assignedTo = field.getCOSObject().getString(COSName.getPDFName("Assign"));
                if (!expectedSignerId.equals(assignedTo)) {
                    throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                            "Le champ '" + fieldName + "' n'est pas assigné à ce signataire.");
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
     * Ajoute une page de signature dédiée à la fin du PDF.
     * La page affiche le nom du signataire et la date de signature.
     * Les accents sont normalisés pour la compatibilité avec les polices Type1.
     * Utilise doc.save() (sauvegarde complète) pour garantir l'inclusion de la nouvelle page.
     *
     * @param pdfBytes   bytes du PDF à modifier
     * @param signerName nom du signataire
     * @param signDate   date de signature
     * @return bytes du PDF avec la page de signature ajoutée
     */
    public byte[] addSignatureStamp(byte[] pdfBytes, String signerName, Calendar signDate) throws IOException {
        try (PDDocument doc = Loader.loadPDF(new RandomAccessReadBuffer(pdfBytes))) {

            PDType1Font font     = new PDType1Font(Standard14Fonts.FontName.HELVETICA);
            PDType1Font fontBold = new PDType1Font(Standard14Fonts.FontName.HELVETICA_BOLD);

            // Normaliser les accents (Type1 ne supporte pas les caractères non-ASCII)
            String displayName = Normalizer.normalize(signerName, Normalizer.Form.NFD)
                    .replaceAll("[^\\p{ASCII}]", "");
            String dateStr = new SimpleDateFormat("dd/MM/yyyy HH:mm", Locale.FRANCE)
                    .format(signDate.getTime());

            // Ajouter une nouvelle page dédiée à la signature
            PDPage sigPage = new PDPage(PDRectangle.A4);
            doc.addPage(sigPage);

            float pageW = sigPage.getMediaBox().getWidth();   // 595 pt
            float pageH = sigPage.getMediaBox().getHeight();  // 842 pt

            try (PDPageContentStream cs = new PDPageContentStream(doc, sigPage)) {

                // Titre
                cs.setFont(fontBold, 16);
                cs.setNonStrokingColor(0.15f, 0.25f, 0.55f);
                cs.beginText();
                cs.newLineAtOffset(50, pageH - 80);
                cs.showText("Signature electronique");
                cs.endText();

                // Ligne séparatrice
                cs.setStrokingColor(0.6f, 0.7f, 0.9f);
                cs.setLineWidth(1f);
                cs.moveTo(50, pageH - 100);
                cs.lineTo(pageW - 50, pageH - 100);
                cs.stroke();

                // Nom du signataire
                cs.setFont(fontBold, 12);
                cs.setNonStrokingColor(0.1f, 0.1f, 0.1f);
                cs.beginText();
                cs.newLineAtOffset(50, pageH - 140);
                cs.showText("Signe par : " + displayName);
                cs.endText();

                // Date
                cs.setFont(font, 11);
                cs.setNonStrokingColor(0.35f, 0.35f, 0.35f);
                cs.beginText();
                cs.newLineAtOffset(50, pageH - 165);
                cs.showText("Date : " + dateStr);
                cs.endText();
            }

            // Sauvegarde complète (non incrémentale) pour garantir l'inclusion de la nouvelle page
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            doc.save(bos);
            log.info("Page de signature ajoutee pour '{}' ({}).", displayName, dateStr);
            return bos.toByteArray();
        }
    }

    /**
     * Signe le PDF master de manière incrémentale avec le certificat de l'application.
     * Utilise PDFBox + BouncyCastle pour générer une signature PKCS#7 détachée.
     *
     * @param masterPdfBytes bytes du PDF master
     * @param privateKey     clé privée RSA
     * @param certificate    certificat X509 auto-signé
     * @return bytes du PDF master signé (avec l'incrément de signature)
     */
    public byte[] signPdf(byte[] masterPdfBytes,
                          PrivateKey privateKey,
                          X509Certificate certificate,
                          String signerName) throws Exception {
        try (PDDocument doc = Loader.loadPDF(new RandomAccessReadBuffer(masterPdfBytes))) {
            PDSignature signature = new PDSignature();
            signature.setFilter(PDSignature.FILTER_ADOBE_PPKLITE);
            signature.setSubFilter(PDSignature.SUBFILTER_ADBE_PKCS7_DETACHED);
            signature.setName("PDF Forms POC %s".formatted(signerName));
            signature.setReason("Signature %s".formatted(signerName));
            signature.setSignDate(Calendar.getInstance());

            SignatureOptions options = new SignatureOptions();
            options.setPreferredSignatureSize(0x2500); // ~9Ko réservé pour la signature

            doc.addSignature(signature, (InputStream content) -> {
                try {
                    return createCmsSignature(content, privateKey, certificate);
                } catch (Exception e) {
                    throw new IOException("Échec de la génération de la signature CMS", e);
                }
            }, options);

            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            doc.saveIncremental(bos);
            log.info("PDF signé avec saveIncremental ({} bytes).", bos.size());
            return bos.toByteArray();
        }
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
