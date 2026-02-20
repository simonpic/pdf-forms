package com.pdfforms.service;

import com.pdfforms.dto.FieldRequest;
import lombok.extern.slf4j.Slf4j;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.io.RandomAccessReadBuffer;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationWidget;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.apache.pdfbox.pdmodel.interactive.form.PDField;
import org.apache.pdfbox.pdmodel.interactive.form.PDTextField;
import org.apache.pdfbox.pdmodel.interactive.digitalsignature.PDSignature;
import org.apache.pdfbox.pdmodel.interactive.digitalsignature.SignatureOptions;
import org.bouncycastle.cert.jcajce.JcaCertStore;
import org.bouncycastle.cms.*;
import org.bouncycastle.operator.jcajce.JcaContentSignerBuilder;
import org.bouncycastle.operator.jcajce.JcaDigestCalculatorProviderBuilder;
import org.bouncycastle.cms.jcajce.JcaSignerInfoGeneratorBuilder;
import org.bouncycastle.operator.ContentSigner;
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

            List<PDField> acroFields = new ArrayList<>();

            for (FieldRequest field : fields) {
                PDPage page = doc.getPage(field.getPage());

                // Créer le champ texte
                PDTextField textField = new PDTextField(acroForm);
                textField.setPartialName(field.getFieldName());
                textField.setDefaultAppearance("/Helv 10 Tf 0 g");

                // Configurer le widget (annotation visuelle)
                PDAnnotationWidget widget = textField.getWidgets().get(0);
                widget.setRectangle(new PDRectangle(
                        (float) field.getX(),
                        (float) field.getY(),
                        (float) field.getWidth(),
                        (float) field.getHeight()
                ));
                widget.setPage(page);
                widget.setPrinted(true);

                // Ajouter le widget à la page
                page.getAnnotations().add(widget);

                // Écrire /Assign dans le COSObject du champ
                textField.getCOSObject().setString(
                        COSName.getPDFName("Assign"),
                        field.getAssignedTo()
                );

                acroFields.add(textField);
                log.debug("Champ créé : {} assigné à {} à ({},{}) {}x{}",
                        field.getFieldName(), field.getAssignedTo(),
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
                acroForm.setNeedAppearances(false);
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
                    textField.setValue(value);
                    log.debug("Valeur appliquée : {} = '{}'", fieldName, value);
                }
            }

            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            doc.save(bos);
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
                          X509Certificate certificate) throws Exception {
        try (PDDocument doc = Loader.loadPDF(new RandomAccessReadBuffer(masterPdfBytes))) {

            PDSignature signature = new PDSignature();
            signature.setFilter(PDSignature.FILTER_ADOBE_PPKLITE);
            signature.setSubFilter(PDSignature.SUBFILTER_ADBE_PKCS7_DETACHED);
            signature.setName("PDF Forms POC");
            signature.setReason("Signature workflow POC");
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
