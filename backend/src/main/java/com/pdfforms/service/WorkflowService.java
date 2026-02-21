package com.pdfforms.service;

import com.pdfforms.dto.*;
import com.pdfforms.model.*;
import com.pdfforms.repository.DocumentRepository;
import com.pdfforms.repository.WorkflowRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.security.KeyPair;
import java.security.cert.X509Certificate;
import java.text.Normalizer;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class WorkflowService {

    private final WorkflowRepository workflowRepository;
    private final DocumentRepository documentRepository;
    private final PdfBoxService pdfBoxService;
    private final KeyPair signingKeyPair;
    private final X509Certificate signingCertificate;

    // -------------------------------------------------------------------------
    // Création du workflow
    // -------------------------------------------------------------------------

    /**
     * Crée un nouveau workflow :
     * 1. Slugifie les noms des signataires
     * 2. Génère le PDF master avec les champs AcroForm
     * 3. Génère le PDF aplati initial
     * 4. Persiste le workflow et son document en base MongoDB
     */
    public List<WorkflowSummaryDto> listWorkflows() {
        return workflowRepository.findAll().stream()
                .map(this::toSummaryDto)
                .sorted(Comparator.comparing(WorkflowSummaryDto::getUpdatedAt).reversed())
                .collect(Collectors.toList());
    }

    private WorkflowSummaryDto toSummaryDto(Workflow workflow) {
        List<WorkflowSummaryDto.SignerSummary> signerSummaries = workflow.getSigners().stream()
                .map(signer -> {
                    String displayStatus;
                    if (signer.getStatus() == SignerStatus.SIGNED) {
                        displayStatus = "SIGNED";
                    } else if (signer.getOrder() == workflow.getCurrentSignerOrder()) {
                        displayStatus = "IN_PROGRESS";
                    } else {
                        displayStatus = "PENDING";
                    }
                    return WorkflowSummaryDto.SignerSummary.builder()
                            .name(signer.getName())
                            .signerId(signer.getSignerId())
                            .order(signer.getOrder())
                            .status(displayStatus)
                            .build();
                })
                .collect(Collectors.toList());

        return WorkflowSummaryDto.builder()
                .id(workflow.getId())
                .name(workflow.getName())
                .pdfOriginalName(workflow.getPdfOriginalName())
                .status(workflow.getStatus().name())
                .createdAt(workflow.getCreatedAt())
                .updatedAt(workflow.getUpdatedAt())
                .signers(signerSummaries)
                .build();
    }

    public WorkflowCreateResponse createWorkflow(byte[] originalPdfBytes,
                                                  WorkflowCreateRequest request,
                                                  String pdfOriginalName) throws Exception {
        log.info("Création du workflow '{}' avec {} signataires et {} champs.",
                request.getName(), request.getSigners().size(), request.getFields().size());

        // 1. Préparer les signataires avec signerId slugifié
        List<Signer> signers = request.getSigners().stream()
                .map(sr -> Signer.builder()
                        .signerId(slugify(sr.getName()))
                        .name(sr.getName())
                        .order(sr.getOrder())
                        .status(SignerStatus.PENDING)
                        .build())
                .sorted(Comparator.comparingInt(Signer::getOrder))
                .collect(Collectors.toList());

        int firstOrder = signers.stream().mapToInt(Signer::getOrder).min().orElse(1);

        // 2. Créer le PDF master avec les champs AcroForm
        byte[] masterPdf = pdfBoxService.createMasterPdf(originalPdfBytes, request.getFields());

        // 3. Générer le PDF aplati initial (champs vides rendus visuellement)
        byte[] flattenedPdf = pdfBoxService.flattenPdf(masterPdf);

        // 4. Persister le workflow
        Workflow workflow = Workflow.builder()
                .name(request.getName())
                .pdfOriginalName(pdfOriginalName)
                .status(WorkflowStatus.IN_PROGRESS)
                .signers(signers)
                .currentSignerOrder(firstOrder)
                .createdAt(LocalDateTime.now())
                .updatedAt(LocalDateTime.now())
                .build();
        workflow = workflowRepository.save(workflow);

        // 5. Persister le document
        List<FieldDefinition> fieldDefs = request.getFields().stream()
                .map(fr -> FieldDefinition.builder()
                        .fieldName(fr.getFieldName())
                        .assignedTo(fr.getAssignedTo())
                        .page(fr.getPage())
                        .x(fr.getX())
                        .y(fr.getY())
                        .width(fr.getWidth())
                        .height(fr.getHeight())
                        .currentValue("")
                        .build())
                .collect(Collectors.toList());

        WorkflowDocument document = WorkflowDocument.builder()
                .workflowId(workflow.getId())
                .masterPdf(masterPdf)
                .flattenedPdf(flattenedPdf)
                .fields(fieldDefs)
                .flattenedStale(false)
                .build();
        documentRepository.save(document);

        log.info("Workflow '{}' créé avec id={}.", workflow.getName(), workflow.getId());

        // Préparer la réponse avec les URLs des signataires
        List<WorkflowCreateResponse.SignerInfo> signerInfos = signers.stream()
                .map(s -> WorkflowCreateResponse.SignerInfo.builder()
                        .name(s.getName())
                        .signerId(s.getSignerId())
                        .order(s.getOrder())
                        .build())
                .collect(Collectors.toList());

        return WorkflowCreateResponse.builder()
                .workflowId(workflow.getId())
                .name(workflow.getName())
                .signers(signerInfos)
                .build();
    }

    // -------------------------------------------------------------------------
    // Récupération du document pour un signataire
    // -------------------------------------------------------------------------

    /**
     * Retourne le document pour le signataire si c'est bien son tour.
     * Récupère directement le workflow par workflowId (O(1) vs scan complet).
     * Régénère le flattenedPdf si flattenedStale == true.
     * Retourne 403 avec un message explicite sinon.
     */
    public SignerDocumentResponse getDocumentForSigner(String workflowId, String signerId) throws Exception {
        log.info("Recherche du document pour workflowId='{}', signerId='{}'.", workflowId, signerId);

        Workflow workflow = workflowRepository.findById(workflowId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Workflow introuvable : " + workflowId));

        Signer signer = workflow.getSigners().stream()
                .filter(s -> s.getSignerId().equals(signerId))
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN,
                        "Signataire inconnu dans ce workflow."));

        if (signer.getStatus() == SignerStatus.SIGNED) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Vous avez déjà signé ce document.");
        }

        if (signer.getOrder() != workflow.getCurrentSignerOrder()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Ce n'est pas encore votre tour. Veuillez patienter que les signataires précédents aient signé.");
        }

        WorkflowDocument document = documentRepository.findByWorkflowId(workflowId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,
                        "Document introuvable pour le workflow " + workflowId));

        if (document.isFlattenedStale()) {
            log.info("Régénération du flattenedPdf pour workflowId={}.", workflowId);
            byte[] freshFlattened = pdfBoxService.flattenPdf(document.getMasterPdf());
            document.setFlattenedPdf(freshFlattened);
            document.setFlattenedStale(false);
            documentRepository.save(document);
        }

        List<FieldDto> signerFields = document.getFields().stream()
                .filter(f -> f.getAssignedTo().equals(signerId))
                .map(f -> FieldDto.builder()
                        .fieldName(f.getFieldName())
                        .page(f.getPage())
                        .x(f.getX())
                        .y(f.getY())
                        .width(f.getWidth())
                        .height(f.getHeight())
                        .currentValue(f.getCurrentValue())
                        .build())
                .collect(Collectors.toList());

        String pdfBase64 = Base64.getEncoder().encodeToString(document.getFlattenedPdf());

        return SignerDocumentResponse.builder()
                .workflowId(workflowId)
                .signerName(signer.getName())
                .signerId(signer.getSignerId())
                .pdfBase64(pdfBase64)
                .fields(signerFields)
                .build();
    }

    // -------------------------------------------------------------------------
    // Remplissage des champs
    // -------------------------------------------------------------------------

    /**
     * Applique les valeurs de champs dans le master PDF.
     * Vérifie que chaque champ appartient au signataire via /Assign.
     */
    public void fillFields(String workflowId, FillRequest request) throws Exception {
        String signerId = slugify(request.getSignerName());
        log.info("Remplissage des champs par signerId='{}' pour workflowId={}.", signerId, workflowId);

        WorkflowDocument document = documentRepository.findByWorkflowId(workflowId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Document introuvable pour workflowId=" + workflowId));

        // Mettre à jour le PDF master
        byte[] updatedMaster = pdfBoxService.applyFieldValues(
                document.getMasterPdf(), request.getFields(), signerId);

        // Mettre à jour les valeurs en base MongoDB
        document.getFields().forEach(field -> {
            if (request.getFields().containsKey(field.getFieldName())) {
                field.setCurrentValue(request.getFields().get(field.getFieldName()));
            }
        });

        document.setMasterPdf(updatedMaster);
        document.setFlattenedStale(true);
        documentRepository.save(document);

        // Mettre à jour le statut du signataire en FILLED
        Workflow workflow = workflowRepository.findById(workflowId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Workflow introuvable : " + workflowId));

        workflow.getSigners().stream()
                .filter(s -> s.getSignerId().equals(signerId))
                .findFirst()
                .ifPresent(s -> s.setStatus(SignerStatus.FILLED));

        workflow.setUpdatedAt(LocalDateTime.now());
        workflowRepository.save(workflow);

        log.info("Champs remplis par '{}' : {}", signerId, request.getFields().keySet());
    }

    // -------------------------------------------------------------------------
    // Signature
    // -------------------------------------------------------------------------

    /**
     * Signe le PDF master de manière incrémentale.
     * Fait avancer currentSignerOrder.
     * Si c'était le dernier signataire, passe le workflow en COMPLETED.
     */
    public Map<String, Object> signDocument(String workflowId, SignRequest request) throws Exception {
        String signerId = slugify(request.getSignerName());
        log.info("Signature par signerId='{}' pour workflowId={}.", signerId, workflowId);

        Workflow workflow = workflowRepository.findById(workflowId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Workflow introuvable : " + workflowId));

        Signer signer = workflow.getSigners().stream()
                .filter(s -> s.getSignerId().equals(signerId))
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN,
                        "Signataire inconnu dans ce workflow."));

        if (signer.getStatus() == SignerStatus.SIGNED) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Vous avez déjà signé ce document.");
        }

        if (signer.getOrder() != workflow.getCurrentSignerOrder()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Ce n'est pas votre tour de signer.");
        }

        WorkflowDocument document = documentRepository.findByWorkflowId(workflowId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,
                        "Document introuvable."));

        // Signer le master PDF de manière incrémentale
        byte[] signedPdf = pdfBoxService.signPdf(
                document.getMasterPdf(),
                signingKeyPair.getPrivate(),
                signingCertificate
        );

        document.setMasterPdf(signedPdf);
        document.setFlattenedStale(true);
        documentRepository.save(document);

        // Marquer le signataire comme SIGNED
        signer.setStatus(SignerStatus.SIGNED);

        // Déterminer le prochain signataire
        int nextOrder = workflow.getCurrentSignerOrder() + 1;
        boolean isLast = workflow.getSigners().stream()
                .noneMatch(s -> s.getOrder() == nextOrder);

        if (isLast) {
            workflow.setStatus(WorkflowStatus.COMPLETED);
            workflow.setCurrentSignerOrder(nextOrder); // au-delà du dernier
            log.info("Workflow {} COMPLETED après signature de '{}'.", workflowId, signerId);
        } else {
            workflow.setCurrentSignerOrder(nextOrder);
            log.info("Tour passé au signataire d'ordre {}.", nextOrder);
        }

        workflow.setUpdatedAt(LocalDateTime.now());
        workflowRepository.save(workflow);

        Map<String, Object> result = new HashMap<>();
        result.put("success", true);
        result.put("workflowStatus", workflow.getStatus().name());
        result.put("completed", isLast);
        return result;
    }

    // -------------------------------------------------------------------------
    // Téléchargement du PDF final
    // -------------------------------------------------------------------------

    /**
     * Retourne le PDF master final, disponible uniquement si status == COMPLETED.
     */
    public byte[] downloadFinalPdf(String workflowId) {
        Workflow workflow = workflowRepository.findById(workflowId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Workflow introuvable : " + workflowId));

        if (workflow.getStatus() != WorkflowStatus.COMPLETED) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Le workflow n'est pas encore complété (statut : " + workflow.getStatus() + ").");
        }

        WorkflowDocument document = documentRepository.findByWorkflowId(workflowId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,
                        "Document introuvable."));

        return document.getMasterPdf();
    }

    // -------------------------------------------------------------------------
    // Utilitaire de slugification
    // -------------------------------------------------------------------------

    /**
     * Convertit un nom en slug URL-safe.
     * Ex : "Jean Dupont" → "jean-dupont", "Signataire A" → "signataire-a"
     */
    public static String slugify(String name) {
        if (name == null || name.isBlank()) return "";
        // Normaliser les caractères accentués
        String normalized = Normalizer.normalize(name, Normalizer.Form.NFD)
                .replaceAll("\\p{InCombiningDiacriticalMarks}+", "");
        return normalized
                .toLowerCase()
                .replaceAll("[^a-z0-9]+", "-")
                .replaceAll("^-+|-+$", "");
    }
}
