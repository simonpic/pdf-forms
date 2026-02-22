# pdf-forms

POC de workflow de signature de formulaires PDF multi-signataires.

L'idée : un instrumentant crée un workflow en uploadant un PDF, place des champs sur le document et les assigne à des signataires. Chaque signataire reçoit un lien, remplit ses champs et signe dans l'ordre défini. Le document final est signé numériquement.

> Pour les détails techniques voir [`docs/`](docs/).

---

## Prérequis

- Java 20+
- Maven 3.9+
- Node.js 18+
- MongoDB sur `localhost:27017`

## Lancer en local

**Backend**
```bash
cd backend
mvn spring-boot:run
```
Accessible sur http://localhost:8080

**Frontend**
```bash
cd frontend
npm install
npm run dev
```
Accessible sur http://localhost:5173
