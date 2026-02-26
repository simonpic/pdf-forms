# Cycle de vie du PDF

Ce document décrit comment le PDF est géré depuis la création du workflow jusqu'à la signature finale, en détaillant le rôle du `masterPdf`, ce qui est envoyé à chaque signataire, et le modèle de données sous-jacent.

---

## Concepts fondamentaux

### masterPdf — la source de vérité

Le `masterPdf` est le document PDF authoritative stocké en base MongoDB. C'est lui qui :

- contient les champs AcroForm avec leurs valeurs renseignées
- accumule les signatures numériques de manière incrémentale (chaque signature s'ajoute sans invalider les précédentes)
- est rendu disponible au téléchargement une fois le workflow complété

Il **n'est jamais envoyé directement** aux signataires.

### flattenedPdf — le snapshot de lecture

Le `flattenedPdf` est une copie aplatie du `masterPdf` à un instant donné. L'aplatissement (`acroForm.flatten()`) supprime les champs AcroForm interactifs et les rend dans la couche graphique du PDF — le document devient donc non-modifiable.

Il sert uniquement à **afficher le document** au signataire, en lui montrant les valeurs remplies par les signataires précédents sans lui donner accès aux champs PDF natifs.

Les champs du signataire courant sont superposés côté front-end via des inputs HTML (composant `FieldOverlay`).

### Flag `flattenedStale`

Après chaque remplissage ou signature, le `masterPdf` est mis à jour mais le `flattenedPdf` ne l'est pas immédiatement. Le flag `flattenedStale = true` indique qu'une régénération est nécessaire. Elle est déclenchée au moment où le prochain signataire charge son document.

---

## Signatures numériques

Deux types de signatures sont appliquées :

| Type | Classe | Moment | Rôle |
|------|--------|--------|------|
| **CertificationSignature** (DocMDP P=2) | `CertificationSignature` | À la création | Certifie l'origine du document ; autorise le remplissage de formulaire sans invalider la signature |
| **ApprovalSignature** (FieldMDP) | `ApprovalSignature` | Après chaque signature de signataire | Approuve le contenu ; verrouille les champs du signataire via un `FieldMDP transform` |

Chaque signature est appliquée de manière **incrémentale** (`saveIncremental`) : la signature précédente n'est pas réécrite mais un nouveau incrément est ajouté à la fin du fichier, ce qui permet la vérification de l'intégrité de chaque signature indépendamment.

---

### Notes sur les coordonnées

Les coordonnées des champs (`x`, `y`, `width`, `height`) sont stockées en **points PDF** avec l'origine en bas à gauche (convention PDF). La conversion depuis les coordonnées canvas (origine haut-gauche) est effectuée côté front-end avant envoi :

```
pdfY = pageHeightPt - (canvasY + fieldHeight) / scale
```

## États du masterPdf

```mermaid
flowchart TD
    A([PDF original uploadé]) --> B

    subgraph CREATION ["Création du workflow"]
        B["createMasterPdf()\n→ Supprime les widgets existants\n→ Crée l'AcroForm\n→ Ajoute /Assign + /FieldType\npar champ"]
        B --> C["signPdf(CertificationSignature)\n→ Signature DocMDP P=2\n→ Certifie le doc\n→ Autorise le remplissage\n→ saveIncremental"]
        C --> D["flattenPdf()\n→ Snapshot vierge\n→ Champs AcroForm aplatis"]
    end

    C -- "masterPdf v1\n(certifié, champs vides)" --> E
    D -- "flattenedPdf v0\n(snapshot vierge)" --> F

    subgraph SIGNER1 ["Signataire 1"]
        E --> G["Signataire reçoit\nflattenedPdf v0 (base64)\n+ ses champs (coords, labels)"]
        G --> H["applyFieldValues()\n→ Remplit les champs PDF\n→ saveIncremental"]
        H --> I["signPdf(ApprovalSignature)\n→ Signature FieldMDP\n→ Verrouille ses champs\n→ saveIncremental"]
    end

    H -- "masterPdf v2\n(champs S1 remplis)" --> I
    I -- "masterPdf v3\n(signé par S1)\nflattenedStale = true" --> J

    subgraph SIGNER2 ["Signataire 2"]
        J["flattenedPdf régénéré\n← flattenPdf(masterPdf v3)\n(montre les valeurs S1)"]
        J --> K["Signataire reçoit\nflattenedPdf v1 (base64)\n+ ses champs"]
        K --> L["applyFieldValues()\n→ Remplit les champs PDF\n→ saveIncremental"]
        L --> M["signPdf(ApprovalSignature)\n→ Signature FieldMDP\n→ Verrouille ses champs\n→ saveIncremental"]
    end

    L -- "masterPdf v4\n(champs S2 remplis)" --> M
    M -- "masterPdf v5\n(signé par S1 + S2)\nworkflow = COMPLETED" --> N

    N([Téléchargement\ndu document final\nmasterPdf v5])

    style CREATION fill:#e0e7ff,stroke:#6366f1
    style SIGNER1 fill:#dcfce7,stroke:#22c55e
    style SIGNER2 fill:#fef9c3,stroke:#eab308
```

---

## Modèle de données

```mermaid
erDiagram
    Workflow {
        String id PK
        String name
        String pdfOriginalName
        WorkflowStatus status
        int currentSignerOrder
        LocalDateTime createdAt
        LocalDateTime updatedAt
        List~Signer~ signers
    }

    Signer {
        String signerId "slug du nom (ex: jean-dupont)"
        String name
        int order
        SignerStatus status "PENDING | SIGNED"
    }

    WorkflowDocument {
        String id PK
        String workflowId FK
        byte[] masterPdf "PDF authoritative (signé incrémentalement)"
        byte[] flattenedPdf "Snapshot aplati pour affichage"
        boolean flattenedStale "true si masterPdf plus récent"
        List~FieldDefinition~ fields
    }

    FieldDefinition {
        String fieldName "identifiant technique (ex: field_1)"
        String label "libellé affiché au signataire"
        String assignedTo "signerId du propriétaire"
        String fieldType "text | checkbox | radio"
        String groupName "pour les boutons radio"
        int page
        double x
        double y
        double width
        double height
        String currentValue "valeur courante"
    }

    Workflow ||--o{ Signer : "contient"
    Workflow ||--|| WorkflowDocument : "possède"
    WorkflowDocument ||--o{ FieldDefinition : "contient"
```

---
