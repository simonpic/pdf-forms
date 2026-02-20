package com.pdfforms.dto;

import lombok.Data;

@Data
public class SignerRequest {
    private String name;
    private int order;
}
