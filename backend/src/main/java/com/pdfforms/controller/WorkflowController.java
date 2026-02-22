package com.pdfforms.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.pdfforms.dto.*;
import com.pdfforms.service.PdfBoxService;
import com.pdfforms.service.WorkflowService;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

import java.nio.charset.StandardCharsets;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.util.List;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/workflows")
@RequiredArgsConstructor
public class WorkflowController {

    private final WorkflowService workflowService;
    private final PdfBoxService pdfBoxService;
    private final ObjectMapper objectMapper;

    /**
     * POST /api/workflows/analyze-pdf
     * Analyse un PDF et retourne la liste des champs AcroForm détectés.
     */
    @PostMapping(value = "/analyze-pdf", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<AnalyzePdfResponse> analyzePdf(
            @RequestParam("file") MultipartFile file) throws Exception {

        log.info("POST /api/workflows/analyze-pdf - fichier: {} ({} bytes)",
                file.getOriginalFilename(), file.getSize());

        if (file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Fichier PDF requis.");
        }

        return ResponseEntity.ok(pdfBoxService.extractFields(file.getBytes()));
    }

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
     * POST /api/workflows/{workflowId}/fill-and-sign
     * Remplit les champs du signataire puis signe le document en une seule opération.
     */
    @PostMapping("/{workflowId}/fill-and-sign")
    public ResponseEntity<Map<String, Object>> fillAndSign(
            @PathVariable String workflowId,
            @RequestBody FillAndSignRequest request) throws Exception {

        log.info("POST /api/workflows/{}/fill-and-sign - signer: {}", workflowId, request.getSignerName());
        Map<String, Object> result = workflowService.fillAndSign(workflowId, request);
        return ResponseEntity.ok(result);
    }

    /**
     * GET /api/workflows/{workflowId}/download
     * Télécharge le PDF master final (uniquement si workflow COMPLETED).
     */
    @GetMapping(value = "/{workflowId}/download", produces = MediaType.APPLICATION_PDF_VALUE)
    public void downloadFinalPdf(
            @PathVariable String workflowId, HttpServletResponse response) throws IOException {

        log.info("GET /api/workflows/{}/download", workflowId);
        String fileName = workflowService.downloadFinalPdf(workflowId, response.getOutputStream());

        response.addHeader(HttpHeaders.CONTENT_DISPOSITION,
                ContentDisposition.attachment()
                        .filename(fileName, StandardCharsets.UTF_8)
                        .build()
                        .toString());
    }
}
