package com.pdfforms.repository;

import com.pdfforms.model.Workflow;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.List;

public interface WorkflowRepository extends MongoRepository<Workflow, String> {

    /**
     * Trouve les workflows contenant un signataire avec l'ID donné.
     * Spring Data MongoDB traduit signers.signerId via l'underscore notation.
     */
    List<Workflow> findBySigners_SignerId(String signerId);
}
