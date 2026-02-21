package com.pdfforms.dto;

import lombok.Data;

@Data
public class FieldRequest {
    private String fieldName;
    private String assignedTo;   // signerId
    private String fieldType;    // "text" | "checkbox" | "radio"
    private String groupName;    // non-null pour les boutons radio
    private int page;
    private double x;
    private double y;
    private double width;
    private double height;
}
