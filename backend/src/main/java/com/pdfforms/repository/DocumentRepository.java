package com.pdfforms.repository;

import com.pdfforms.model.WorkflowDocument;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.Optional;

public interface DocumentRepository extends MongoRepository<WorkflowDocument, String> {

    Optional<WorkflowDocument> findByWorkflowId(String workflowId);
}
