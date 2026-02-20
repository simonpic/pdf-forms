package com.pdfforms.dto;

import lombok.Data;

import java.util.List;

@Data
public class WorkflowCreateRequest {
    private String name;
    private List<SignerRequest> signers;
    private List<FieldRequest> fields;
}
