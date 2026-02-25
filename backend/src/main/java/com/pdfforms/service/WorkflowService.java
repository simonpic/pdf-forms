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

import java.io.IOException;
import java.io.OutputStream;
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

        var certificationSignature = CertificationSignature.builder()
                .privateKey(signingKeyPair.getPrivate())
                .certificate(signingCertificate)
                .signerName("coc_platform")
                .permissionLevel(SignaturePermissionLevel.FORM_FILL)
                .build();
        masterPdf = pdfBoxService.signPdf(masterPdf, certificationSignature, null, null);

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
                        .label(fr.getLabel())
                        .assignedTo(fr.getAssignedTo())
                        .fieldType(fr.getFieldType() != null ? fr.getFieldType() : "text")
                        .groupName(fr.getGroupName())
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
                        .label(f.getLabel())
                        .fieldType(f.getFieldType() != null ? f.getFieldType() : "text")
                        .groupName(f.getGroupName())
                        .page(f.getPage())
                        .x(f.getX())
                        .y(f.getY())
                        .width(f.getWidth())
                        .height(f.getHeight())
                        .currentValue(f.getCurrentValue())
                        .build())
                .collect(Collectors.toList());

        String pdfBase64 = Base64.getEncoder().encodeToString(document.getFlattenedPdf());

        int maxOrder = workflow.getSigners().stream().mapToInt(Signer::getOrder).max().orElse(0);
        boolean isLastSigner = signer.getOrder() == maxOrder;

        List<SignerDocumentResponse.SignerContext> signerContexts = workflow.getSigners().stream()
                .sorted(Comparator.comparingInt(Signer::getOrder))
                .map(s -> {
                    String status;
                    if (s.getSignerId().equals(signerId)) {
                        status = "CURRENT";
                    } else if (s.getStatus() == SignerStatus.SIGNED) {
                        status = "SIGNED";
                    } else {
                        status = "PENDING";
                    }
                    return SignerDocumentResponse.SignerContext.builder()
                            .name(s.getName())
                            .order(s.getOrder())
                            .status(status)
                            .build();
                })
                .collect(Collectors.toList());

        return SignerDocumentResponse.builder()
                .workflowId(workflowId)
                .workflowName(workflow.getName())
                .signerName(signer.getName())
                .signerId(signer.getSignerId())
                .pdfBase64(pdfBase64)
                .fields(signerFields)
                .lastSigner(isLastSigner)
                .signers(signerContexts)
                .build();
    }

    /**
     * Remplit les champs du signataire et signe le PDF master en une seule passe saveIncremental.
     * Charge Workflow et WorkflowDocument une seule fois, effectue une seule sauvegarde de chacun.
     */
    public Map<String, Object> fillAndSign(String workflowId, FillAndSignRequest request) throws Exception {
        String signerId = slugify(request.getSignerName());
        log.info("fillAndSign: signerId='{}', workflowId='{}'.", signerId, workflowId);

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

        Map<String, String> fieldValues = request.getFields() != null ? request.getFields() : Map.of();

        List<FieldDefinition> updatedFields = document.getFields().stream()
                .filter(field -> signerId.equals(field.getAssignedTo()))
                .filter(field -> fieldValues.containsKey(field.getFieldName()))
                .toList();

        updatedFields.forEach(field -> field.setCurrentValue(fieldValues.get(field.getFieldName())));
        log.info("Update {} fields for {} in request", updatedFields.size(), fieldValues.size());

        List<String> fieldsToLock = updatedFields.stream().map(FieldDefinition::getFieldName).toList();
        var approvalSignature = ApprovalSignature.builder()
                .privateKey(signingKeyPair.getPrivate())
                .certificate(signingCertificate)
                .signerName(signerId)
                .fieldToLock(fieldsToLock)
                .build();

        if (request.getSignaturePlacement() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "La position de la signature est obligatoire.");
        }

        byte[] signedPdf = pdfBoxService.signPdf(
                document.getMasterPdf(), approvalSignature, updatedFields,
                request.getSignaturePlacement());

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
            workflow.setCurrentSignerOrder(nextOrder);
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

    /**
     * Retourne le PDF master final, disponible uniquement si status == COMPLETED.
     */
    public String downloadFinalPdf(String workflowId, OutputStream outputStream) throws IOException {
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

        outputStream.write(document.getMasterPdf());

        return workflow.getName() + ".pdf";
    }
}
