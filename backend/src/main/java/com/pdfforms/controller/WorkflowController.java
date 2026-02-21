package com.pdfforms.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.pdfforms.dto.*;
import com.pdfforms.service.WorkflowService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/workflows")
@RequiredArgsConstructor
public class WorkflowController {

    private final WorkflowService workflowService;
    private final ObjectMapper objectMapper;

    /**
     * GET /api/workflows
     * Retourne la liste résumée de tous les workflows, triée par updatedAt décroissant.
     */
    @GetMapping
    public ResponseEntity<List<WorkflowSummaryDto>> listWorkflows() {
        return ResponseEntity.ok(workflowService.listWorkflows());
    }

    /**
     * POST /api/workflows
     * Crée un nouveau workflow à partir d'un PDF uploadé et des métadonnées.
     * Accepte multipart/form-data : file (PDF) + data (JSON WorkflowCreateRequest).
     */
    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<WorkflowCreateResponse> createWorkflow(
            @RequestPart("file") MultipartFile file,
            @RequestPart("data") String dataJson) throws Exception {

        log.info("POST /api/workflows - fichier: {} ({} bytes)",
                file.getOriginalFilename(), file.getSize());

        WorkflowCreateRequest request = objectMapper.readValue(dataJson, WorkflowCreateRequest.class);
        WorkflowCreateResponse response = workflowService.createWorkflow(
                file.getBytes(), request, file.getOriginalFilename());

        return ResponseEntity.ok(response);
    }

    /**
     * GET /api/workflows/{workflowId}/signer/{signerId}
     * Retourne le document pour le signataire si c'est son tour.
     * Retourne 403 avec un message explicite sinon.
     */
    @GetMapping("/{workflowId}/signer/{signerId}")
    public ResponseEntity<SignerDocumentResponse> getDocumentForSigner(
            @PathVariable String workflowId,
            @PathVariable String signerId) throws Exception {

        log.info("GET /api/workflows/{}/signer/{}", workflowId, signerId);
        SignerDocumentResponse response = workflowService.getDocumentForSigner(workflowId, signerId);
        return ResponseEntity.ok(response);
    }

    /**
     * POST /api/workflows/{workflowId}/fill
     * Remplit les champs du signataire dans le PDF master.
     */
    @PostMapping("/{workflowId}/fill")
    public ResponseEntity<Map<String, Object>> fillFields(
            @PathVariable String workflowId,
            @RequestBody FillRequest request) throws Exception {

        log.info("POST /api/workflows/{}/fill - signer: {}", workflowId, request.getSignerName());
        workflowService.fillFields(workflowId, request);
        return ResponseEntity.ok(Map.of("success", true));
    }

    /**
     * POST /api/workflows/{workflowId}/sign
     * Signe le PDF master et fait avancer le workflow au signataire suivant.
     */
    @PostMapping("/{workflowId}/sign")
    public ResponseEntity<Map<String, Object>> signDocument(
            @PathVariable String workflowId,
            @RequestBody SignRequest request) throws Exception {

        log.info("POST /api/workflows/{}/sign - signer: {}", workflowId, request.getSignerName());
        Map<String, Object> result = workflowService.signDocument(workflowId, request);
        return ResponseEntity.ok(result);
    }

    /**
     * GET /api/workflows/{workflowId}/download
     * Télécharge le PDF master final (uniquement si workflow COMPLETED).
     */
    @GetMapping("/{workflowId}/download")
    public ResponseEntity<byte[]> downloadFinalPdf(
            @PathVariable String workflowId) {

        log.info("GET /api/workflows/{}/download", workflowId);
        byte[] pdfBytes = workflowService.downloadFinalPdf(workflowId);

        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=\"workflow-" + workflowId + "-signed.pdf\"")
                .contentType(MediaType.APPLICATION_PDF)
                .body(pdfBytes);
    }
}
