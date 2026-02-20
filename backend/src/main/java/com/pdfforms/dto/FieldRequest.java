package com.pdfforms.dto;

import lombok.Data;

@Data
public class FieldRequest {
    private String fieldName;
    private String assignedTo;   // signerId
    private int page;
    private double x;
    private double y;
    private double width;
    private double height;
}
