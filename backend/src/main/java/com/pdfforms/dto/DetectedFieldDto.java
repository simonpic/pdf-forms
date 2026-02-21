package com.pdfforms.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DetectedFieldDto {
    private String fieldName;
    private String fieldType;   // "text" | "checkbox" | "radio"
    private int    page;        // 0-indexed
    private double x;           // points PDF, origine bas-gauche
    private double y;
    private double width;
    private double height;
    private String groupName;   // non-null pour les boutons radio
}
