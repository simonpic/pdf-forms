package com.pdfforms.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.LocalDateTime;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Document(collection = "workflows")
public class Workflow {

    @Id
    private String id;

    private String name;
    private WorkflowStatus status;
    private List<Signer> signers;
    private int currentSignerOrder;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
