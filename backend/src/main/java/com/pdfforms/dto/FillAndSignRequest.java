package com.pdfforms.dto;

import lombok.Data;

import java.util.HashMap;
import java.util.Map;

@Data
public class FillAndSignRequest {
    private String signerName;
    private Map<String, String> fields = new HashMap<>();  // fieldName -> value
    /** Optionnel : position choisie par le signataire. Null → position par défaut. */
    private SignaturePlacement signaturePlacement;
}
