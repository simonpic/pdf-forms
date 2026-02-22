package com.pdfforms.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class FieldDto {
    private String fieldName;
    private String label;        // libellé lisible affiché au signataire
    private String fieldType;    // "text" | "checkbox" | "radio"
    private String groupName;    // non-null pour les boutons radio
    private int page;
    private double x;
    private double y;
    private double width;
    private double height;
    private String currentValue;
}
