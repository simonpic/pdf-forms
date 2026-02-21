package com.pdfforms.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SignerDocumentResponse {
    private String workflowId;
    private String workflowName;
    private String signerName;
    private String signerId;
    private String pdfBase64;          // PDF aplati encodé en base64
    private List<FieldDto> fields;     // Champs assignés à ce signataire
}
