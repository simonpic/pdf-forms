# PDF Signature Workflow — POC

Application de workflow de signature PDF multi-signataires.

## Stack

- **Back-end** : Java 20, Spring Boot 3.2, Apache PDFBox 3.0.2, MongoDB
- **Front-end** : React 18, PDF.js, Tailwind CSS, Vite

## Prérequis

- Java 20+
- Maven 3.9+
- Node.js 18+
- MongoDB en local sur le port 27017

## Démarrage

### 1. Backend

```bash
cd backend
mvn spring-boot:run
```

Le serveur écoute sur http://localhost:8080

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

L'application est accessible sur http://localhost:5173

## Utilisation

### Créer un workflow (instrumentant)

1. Aller sur http://localhost:5173/create
2. Uploader un PDF
3. Ajouter les signataires (ex: "Signataire-A", "Signataire-B")
4. Dessiner des champs en cliquant-glissant sur le PDF, assigner chacun à un signataire
5. Nommer le workflow et soumettre
6. Récupérer les URLs des signataires affichées

### Signer (signataire)

Accéder à `/signature/{signerId}` — ex: `/signature/signataire-a`

- Si c'est votre tour : remplir les champs, valider, signer
- Sinon : message explicatif affiché

### Télécharger le PDF final

`GET /api/workflows/{workflowId}/download` (disponible uniquement après COMPLETED)

## Architecture

### Flux de coordonnées

Les coordonnées sont stockées en espace PDF (points, origine bas-gauche) :

**Canvas → PDF (lors de la création)**
```
pdfX = canvasX / scale
pdfY = pageHeightPt - (canvasY + fieldHeight) / scale
```

**PDF → CSS (lors de l'affichage)**
```
cssLeft = field.x * scale
cssTop  = (pageHeightPt - field.y - field.height) * scale
```

### Modèle MongoDB

- Collection `workflows` : état du workflow, liste des signataires, ordre courant
- Collection `documents` : bytes du PDF master et aplati, définitions des champs

### Sécurité des champs

Chaque champ AcroForm contient une entrée `/Assign` (COSObject) avec le `signerId`.
Le backend vérifie cette entrée lors de `/fill` pour s'assurer que le signataire
ne peut remplir que ses propres champs.

### Signature PDF

- Certificat RSA 2048 auto-signé généré au démarrage (bean Spring singleton)
- Signature CMS/PKCS#7 détachée via BouncyCastle
- Sauvegarde incrémentale avec `PDDocument.saveIncremental()`
