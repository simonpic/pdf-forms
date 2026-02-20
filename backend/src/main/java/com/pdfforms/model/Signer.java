package com.pdfforms.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Signer {
    private String signerId;   // slugifié depuis le nom, ex: "jean-dupont"
    private String name;       // nom affiché
    private int order;         // 1, 2, ...
    private SignerStatus status;
}
