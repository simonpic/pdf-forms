package com.pdfforms.model;

import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.experimental.SuperBuilder;

import java.util.List;

@EqualsAndHashCode(callSuper = true)
@SuperBuilder
@Data
public class ApprovalSignature extends Signature {
    private List<String> fieldToLock;
}
