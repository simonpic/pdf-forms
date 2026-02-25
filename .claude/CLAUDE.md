# Contexte du projet — pdf-forms

## Description

Application de signature de workflows PDF. Un créateur téléverse un PDF, place des champs AcroForm et les assigne à des signataires nommés. Les signataires remplissent leurs champs et signent le document séquentiellement dans l'ordre défini.

---

## Stack technique

| Couche | Technologies |
|--------|-------------|
| Backend | Java 20, Spring Boot 3.2.3, Apache PDFBox 3.0.2, BouncyCastle 1.78.1, MongoDB |
| Frontend | React 18, Vite 5, Tailwind CSS 3, PDF.js (pdfjs-dist 4.x), shadcn/ui |

---

## Structure du projet

```
pdf-forms/
  backend/src/main/java/com/pdfforms/
    controller/      # Endpoints REST
    service/         # WorkflowService, PdfBoxService, SigningKeyService
    model/           # Workflow, Signer, WorkflowDocument, FieldDefinition
    dto/             # DTOs Requête/Réponse
    repository/      # WorkflowRepository, DocumentRepository
  frontend/src/
    pages/           # CreateWorkflow.jsx, SignerPage.jsx, WorkflowList.jsx
    components/      # FieldDrawingLayer, SignaturePanel, SignerSequence, ...
    lib/             # signerColors.js, api/, utils/
  docs/
    pdf-lifecycle.md    # Diagramme d'états PDF + ERD + diagramme de séquence
    dettes.txt          # Backlog de dettes techniques
```

---

## Commandes

**Backend (Maven absent du PATH — utiliser le chemin complet) :**
```bash
/c/Users/simon/.m2/wrapper/dists/apache-maven-3.9.3-bin/326f10f4/apache-maven-3.9.3/bin/mvn spring-boot:run -pl backend
```

**Frontend :**
```bash
cd frontend && npm run dev
```

---

## Décisions d'architecture — À respecter impérativement

### Modèle PDF
- **Master PDF** : document vivant, accumule les sauvegardes incrémentielles (champs + signatures)
- **Flattened PDF** : copie aplatie du master, affichée en lecture seule au signataire ; régénérée à la demande (flag `flattenedStale`)
- Les deux sont stockés en `byte[]` dans MongoDB (limite 16 Mo — dette connue)

### Signature PDFBox
- **Signature de certification** (DocMDP, P=2) appliquée à la création du workflow
- **Signature d'approbation** (FieldMDP) appliquée à chaque étape de signature
- **Fill + sign en une seule passe** : `applyFieldValues()` + `addSignature()` sur le même `PDDocument`, un seul `saveIncremental()`. Pas de révision intermédiaire.
- `NeedAppearances` positionné à `false` avant `saveIncremental()` (exigence des validators PDF)
- PDFBox génère les streams `/AP` immédiatement à `setValue()`, indépendamment du flag `NeedAppearances`

### Identification des signataires
- Pas d'authentification — le signataire est identifié par son nom slugifié dans l'URL : `/signature/{signerId}`
- `signerId = slugify(name)` ex : "Jean Dupont" → `"jean-dupont"`
- Ownership des champs : contrôle côté MongoDB (source de vérité), pas côté PDF

### Coordonnées PDF
- Stockées en points PDF (origine bas-gauche)
- Conversion canvas → PDF faite côté frontend : `pdfY = pageHeightPt - (canvasY + fieldH) / scale`
- Conversion PDF → CSS : `cssTop = (pageHeightPt - field.y - field.height) * scale`

### Couleurs signataires
- Tableau partagé `SIGNER_UI_COLORS` dans `frontend/src/lib/signerColors.js`
- Utilisé dans `SignerList` (badges) et `FieldDrawingLayer` (popup de configuration)

---

# Agents spécialisés — Assistant projet

Ce projet utilise un ensemble d'agents spécialisés. Chaque agent a un domaine d'expertise dédié et un format de sortie spécifique.
Pour activer un agent, référencez explicitement son nom ou son rôle dans votre requête.

---

## Agents disponibles

| Agent | Rôle | Activation |
|-------|------|------------|
| **UX Designer** | Parcours utilisateur, wireframes | *"Act as UX Designer..."* |
| **Software Architect** | Architecture, patterns, scalabilité | *"Act as Software Architect..."* |
| **PDF Specialist** | Génération PDF, PDFBox | *"Act as PDF Specialist..."* |
| **Frontend Developer** | React, TypeScript, shadcn/ui | *"Act as Frontend Developer..."* |
| **Backend Developer** | Java 20, Spring Boot 3, MongoDB | *"Act as Backend Developer..."* |
| **Documentation Writer** | Docs techniques, ADR, README, API docs | *"Act as Documentation Writer..."* |

---

## Workflow de création de projet recommandé

Pour démarrer un nouveau projet from scratch, suivre ce pipeline dans l'ordre :

### Phase 1 — Design UX
> **Agent :** UX Designer | **Sortie :** `docs/ux-spec.md`

Définir les personas, les parcours utilisateur principaux, l'architecture de l'information et les écrans clés.

### Phase 2 — Architecture logicielle
> **Agent :** Software Architect | **Sortie :** `docs/architecture.md`

Lire `docs/ux-spec.md`, puis définir l'architecture système, les choix de stack, les modèles de données et les contrats d'API.

### Phase 3 — Implémentation
> **Agents :** Frontend Developer + Backend Developer (en parallèle)

Lire `docs/architecture.md` et produire l'implémentation en respectant les conventions définies.

### Phase 4 — Documentation
> **Agent :** Documentation Writer | **Sortie :** `docs/README.md`, `docs/adr/`

Consolider tous les documents produits en une documentation technique propre et professionnelle.

---

## Combos d'agents

### Combo Fullstack — Frontend + Backend

Utiliser ce combo pour implémenter une fonctionnalité des deux côtés simultanément, en s'assurant que le contrat d'API est la source de vérité unique.

**Activation :**
```
Use Fullstack Combo
```
