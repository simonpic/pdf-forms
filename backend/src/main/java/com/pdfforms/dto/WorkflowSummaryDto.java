package com.pdfforms.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class WorkflowSummaryDto {

    private String id;
    private String name;
    private String pdfOriginalName;
    private String status;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private List<SignerSummary> signers;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class SignerSummary {
        private String name;
        private String signerId;
        private int order;
        private String status; // PENDING | IN_PROGRESS | SIGNED
    }
}
