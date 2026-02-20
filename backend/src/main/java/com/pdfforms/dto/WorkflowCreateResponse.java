package com.pdfforms.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class WorkflowCreateResponse {
    private String workflowId;
    private String name;
    private List<SignerInfo> signers;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class SignerInfo {
        private String name;
        private String signerId;
        private int order;
    }
}
