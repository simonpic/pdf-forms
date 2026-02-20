package com.pdfforms.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Document(collection = "documents")
public class WorkflowDocument {

    @Id
    private String id;

    private String workflowId;

    private byte[] masterPdf;
    private byte[] flattenedPdf;

    private List<FieldDefinition> fields;

    /**
     * true si le master a changé depuis le dernier aplatissement.
     * Le flattenedPdf doit être régénéré avant d'être envoyé au prochain signataire.
     */
    private boolean flattenedStale;
}
