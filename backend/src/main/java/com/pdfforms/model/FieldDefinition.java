package com.pdfforms.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class FieldDefinition {
    private String fieldName;
    private String assignedTo;   // signerId
    private String fieldType;    // "text" | "checkbox" | "radio"
    private String groupName;    // non-null for radio fields (nom du groupe)
    private int page;            // 0-indexed
    private double x;
    private double y;
    private double width;
    private double height;
    private String currentValue;
}
