package com.pdfforms.dto;

import lombok.Data;

import java.util.Map;

@Data
public class FillRequest {
    private String signerName;
    private Map<String, String> fields;  // fieldName -> value
}
