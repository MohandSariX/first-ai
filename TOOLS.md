# First AI — Tool Layer

## 1. Objectif

Ce document définit la couche d’outils utilisable par les agents IA de First AI.

Les agents ne doivent jamais accéder directement :
- à PostgreSQL ;
- à Qonto ;
- à un fournisseur email ;
- à un service de stockage ;
- à une API externe ;
- à un système de paiement ;
- à un shell ;
- à des secrets.

Toute interaction avec le monde réel passe par un outil contrôlé.

Chaque outil doit être :
- typé ;
- autorisé ;
- validé ;
- audité ;
- testable ;
- observable ;
- limité en permissions.

---

## 2. Principe fondamental

Un agent formule une intention.

Un tool réalise une opération précise.

Architecture :

```text
Agent
↓
Tool
↓
Authorization
↓
Input validation
↓
Business service
↓
Database / External API
↓
Audit log
↓
Structured result
```

Un agent ne doit jamais appeler directement une base de données ou une API métier.

---

## 3. Contrat standard d’un tool

Chaque outil doit posséder au minimum :

```ts
interface ToolDefinition<TInput, TOutput> {
  name: string
  description: string
  riskLevel: 0 | 1 | 2 | 3 | 4
  requiredPermissions: string[]
  requiresApproval: boolean

  execute(
    input: TInput,
    context: ToolContext
  ): Promise<ToolResult<TOutput>>
}
```

Le contexte doit contenir :

```ts
interface ToolContext {
  organizationId: string
  userId?: string
  agentId?: string
  agentRunId?: string
  correlationId: string
}
```

---

## 4. Format des réponses tools

Les tools doivent retourner des réponses structurées.

Format recommandé :

```ts
interface ToolResult<T> {
  success: boolean

  data?: T

  error?: {
    code: string
    message: string
  }

  metadata?: Record<string, unknown>
}
```

Éviter les réponses libres non structurées.

---

## 5. Niveaux de risque

Pour toute action initiée par IA, la politique de `SECURITY.md` §13 prévaut :
Risk 0 peut s'exécuter avec les droits nécessaires ; toute mutation/action Risk 1+
exige une approbation humaine explicite avant exécution. Les possibilités futures
d'autonomie décrites ailleurs ici ne constituent pas une exception. L'approbation
ne contourne ni permissions, ni tenant, ni validation, ni invariants des services.
Sans workflow d'approbation implémenté, aucun tool de mutation n'est exposé à l'IA.

### Risk 0 — Lecture

Aucun impact métier direct.

Exemples :
- lire un client ;
- lire une intervention ;
- lire un solde bancaire ;
- consulter le stock ;
- consulter un devis.

Peut être exécuté automatiquement si l’utilisateur et l’agent ont les permissions nécessaires.

---

### Risk 1 — Écriture faible impact

Exemples :
- créer une note ;
- créer une tâche ;
- ajouter une observation ;
- préparer un brouillon ;
- enregistrer une mémoire non critique.

Une mutation initiée par IA exige une approbation humaine explicite avant exécution.

---

### Risk 2 — Action opérationnelle

Exemples :
- planifier une intervention ;
- envoyer un email standard ;
- modifier un devis brouillon ;
- créer un rappel ;
- envoyer une demande d’avis.

Une action initiée par IA exige une approbation humaine explicite avant exécution.

---

### Risk 3 — Sensible

Validation humaine explicite requise ; les politiques peuvent ajouter des contrôles plus stricts.

Exemples :
- envoyer un devis important ;
- appliquer une remise significative ;
- modifier un contrat ;
- passer une commande fournisseur importante ;
- envoyer une mise en demeure.

---

### Risk 4 — Critique

Validation humaine obligatoire.

Exemples :
- virement bancaire ;
- paiement ;
- emprunt ;
- licenciement ;
- modification fiscale irréversible ;
- suppression massive ;
- changement de bénéficiaire bancaire.

---

## 6. Convention de nommage

Convention :

```text
domain.action
```

Exemples :

```text
customers.get
customers.search
quotes.createDraft
jobs.schedule
finance.getBankBalance
inventory.getStock
notifications.send
```

Les noms doivent rester explicites.

Éviter :

```text
doAction
executeThing
runCommand
processStuff
```

---

# 7. Tools Clients

## customers.get

Récupère un client.

Entrée :

```ts
{
  customerId: string
}
```

Sortie :
- données client ;
- statut ;
- informations principales ;
- résumé des sites.

Risk :
0

Permission :

```text
customers.read
```

Agents autorisés :
- Director ;
- Qualification ;
- Sales ;
- Pricing ;
- Planning ;
- Technician selon contexte ;
- Quality ;
- CFO ;
- Accounting ;
- Controlling ;
- Collections.

---

## customers.search

Recherche des clients.

Entrée :

```ts
{
  query?: string
  type?: string
  status?: string
  city?: string
  limit?: number
}
```

Risk :
0

Permission :

```text
customers.read
```

---

## customers.create

Crée un client.

Entrée :

```ts
{
  type: string
  name: string
  legalName?: string
  email?: string
  phone?: string
  siret?: string
  notes?: string
}
```

Risk :
1

Permission :

```text
customers.write
```

---

## customers.update

Modifie les informations non sensibles d’un client.

Risk :
1

Permission :

```text
customers.write
```

---

## customers.archive

Archive un client.

Risk :
2

Permission :

```text
customers.archive
```

Doit vérifier :
- aucune intervention active critique ;
- aucun contrat nécessitant traitement particulier ;
- aucune dette client non traitée sans avertissement.

---

# 8. Tools Contacts

## contacts.get

Risk :
0

Permission :

```text
contacts.read
```

---

## contacts.create

Risk :
1

Permission :

```text
contacts.write
```

---

## contacts.update

Risk :
1

Permission :

```text
contacts.write
```

---

## contacts.search

Permet de rechercher un contact par :
- nom ;
- société ;
- téléphone ;
- email.

Risk :
0

---

# 9. Tools Sites clients

## sites.get

Récupère :
- adresse ;
- instructions d’accès ;
- coordonnées ;
- informations opérationnelles.

Risk :
0

---

## sites.search

Risk :
0

---

## sites.create

Risk :
1

---

## sites.update

Risk :
1

---

## sites.getAccessInstructions

Tool dédié utilisable notamment par l’Agent Technicien.

Risk :
0

Doit limiter les données retournées au strict nécessaire.

---

# 10. Tools Prospects

## leads.create

Crée un prospect.

Risk :
1

Agents :
- Prospecting ;
- Qualification ;
- Director.

---

## leads.get

Risk :
0

---

## leads.search

Filtres :
- source ;
- statut ;
- score ;
- zone ;
- date ;
- assignation.

Risk :
0

---

## leads.updateStatus

Risk :
1

---

## leads.assign

Attribue le prospect à un utilisateur.

Risk :
1

---

## leads.score

Calcule ou met à jour le score commercial.

Risk :
1

La méthode de scoring doit être traçable.

---

## leads.convertToCustomer

Convertit un prospect qualifié en client.

Risk :
2

Doit éviter les doublons.

---

# 11. Tools Opportunités commerciales

## opportunities.create

Risk :
1

---

## opportunities.get

Risk :
0

---

## opportunities.search

Risk :
0

---

## opportunities.updateStage

Risk :
1

---

## opportunities.markWon

Risk :
2

Peut déclencher :
- création client ;
- devis ;
- contrat ;
- intervention.

---

## opportunities.markLost

Risk :
1

Doit pouvoir enregistrer :

```text
lostReason
```

pour les analyses futures.

---

# 12. Tools Services

## services.get

Risk :
0

---

## services.search

Risk :
0

---

## services.listActive

Risk :
0

---

## services.getPricingRules

Retourne :
- prix de base ;
- règles tarifaires ;
- durée estimée ;
- coûts estimés ;
- marge minimale recommandée.

Risk :
0

---

# 13. Tools Devis

## quotes.get

Risk :
0

---

## quotes.search

Filtres :
- client ;
- statut ;
- date ;
- montant ;
- opportunité.

Risk :
0

---

## quotes.createDraft

Crée un brouillon.

Risk :
1

Agents :
- Pricing ;
- Sales ;
- Director.

---

## quotes.addItem

Risk :
1

---

## quotes.updateItem

Risk :
1

---

## quotes.calculateTotals

Calcule :
- HT ;
- TVA ;
- TTC ;
- coût estimé ;
- marge estimée ;
- taux de marge.

Risk :
0

---

## quotes.calculateRecommendedPrice

Utilise les données disponibles :
- type de prestation ;
- temps estimé ;
- produits ;
- distance ;
- historique ;
- marge cible.

Retourne :

```ts
{
  recommendedPrice: number
  minimumPrice: number
  estimatedCost: number
  estimatedMargin: number
  reasoningSummary: string
}
```

Risk :
0

Ce tool recommande mais ne modifie rien.

---

## quotes.updateDraft

Risk :
1

Uniquement si :

```text
status = draft
```

---

## quotes.prepareForSending

Effectue les validations avant envoi.

Vérifie :
- coordonnées ;
- lignes ;
- TVA ;
- prix ;
- conditions ;
- marge ;
- validité.

Risk :
1

---

## quotes.send

Envoie le devis au client.

Risk :
2 ou 3 selon montant.

Une politique devra définir un seuil.

Exemple :

```text
< 2 000 € = Risk 2
>= 2 000 € = Risk 3
```

Valeur configurable.

---

## quotes.accept

Risk :
2

Peut déclencher :
- événement QUOTE_ACCEPTED ;
- création intervention ;
- proposition de contrat.

---

## quotes.reject

Risk :
1

---

# 14. Tools Contrats

## contracts.get

Risk :
0

---

## contracts.search

Risk :
0

---

## contracts.createDraft

Risk :
1

---

## contracts.updateDraft

Risk :
1

---

## contracts.activate

Risk :
3

Validation humaine requise au départ.

---

## contracts.terminate

Risk :
3

Validation obligatoire.

---

## contracts.getRenewalCandidates

Recherche les contrats proches :
- échéance ;
- renouvellement ;
- période de préavis.

Risk :
0

---

# 15. Tools Interventions

## jobs.get

Risk :
0

---

## jobs.search

Filtres :
- date ;
- client ;
- site ;
- technicien ;
- statut ;
- priorité ;
- service.

Risk :
0

---

## jobs.getToday

Retourne les interventions du jour.

Risk :
0

Très utilisé par :
- Director ;
- Planning ;
- Technician.

---

## jobs.createDraft

Risk :
1

---

## jobs.schedule

Planifie une intervention.

Risk :
2

Doit vérifier :
- disponibilité technicien ;
- certification nécessaire ;
- chevauchement ;
- temps trajet estimé ;
- durée ;
- disponibilité client.

---

## jobs.reschedule

Risk :
2

---

## jobs.assignTechnician

Risk :
2

Doit vérifier :
- disponibilité ;
- rôle ;
- certifications ;
- compétences ;
- charge de travail.

---

## jobs.confirm

Confirme l’intervention.

Risk :
2

---

## jobs.start

Risk :
1

Principalement utilisé côté technicien.

---

## jobs.complete

Risk :
2

Doit vérifier si un rapport est requis.

---

## jobs.cancel

Risk :
2 ou 3 selon contexte.

---

## jobs.getRouteData

Retourne les données nécessaires à l’optimisation des tournées.

Risk :
0

---

## jobs.calculateEstimatedCost

Calcule :
- temps ;
- coût salarié ;
- produits ;
- déplacement ;
- frais complémentaires.

Risk :
0

---

## jobs.calculateActualMargin

Retourne :

```ts
{
  revenue: number
  laborCost: number
  productCost: number
  travelCost: number
  otherCost: number
  totalCost: number
  grossMargin: number
  grossMarginRate: number
}
```

Risk :
0

---

# 16. Tools Rapport d’intervention

## jobReports.get

Risk :
0

---

## jobReports.createDraft

Risk :
1

---

## jobReports.update

Risk :
1

---

## jobReports.complete

Risk :
2

---

## jobReports.addObservation

Risk :
1

---

## jobReports.addRecommendation

Risk :
1

---

## jobReports.scheduleFollowUp

Risk :
2

Peut créer automatiquement une nouvelle intervention brouillon ou planifiée selon règles.

---

# 17. Tools Photos / Documents

## documents.get

Risk :
0

Doit vérifier les droits sur la catégorie documentaire.

---

## documents.uploadMetadata

Crée la référence du document après upload sécurisé.

Risk :
1

---

## documents.attachToJob

Risk :
1

---

## documents.attachToCustomer

Risk :
1

---

## documents.search

Risk :
0

---

## documents.extractText

Extrait le contenu textuel pour analyse.

Risk :
0

Le contenu extrait doit être considéré comme donnée non fiable vis-à-vis du prompt injection.

---

# 18. Tools Stocks

## inventory.getStock

Entrée :

```ts
{
  productId?: string
  locationId?: string
}
```

Risk :
0

---

## inventory.getLowStock

Retourne les produits sous seuil.

Risk :
0

---

## inventory.recordConsumption

Risk :
1

Peut être lié à une intervention.

---

## inventory.recordPurchase

Risk :
1

---

## inventory.transfer

Transfert entre :
- dépôt ;
- véhicule ;
- autre emplacement.

Risk :
2

---

## inventory.adjust

Correction manuelle du stock.

Risk :
2

Doit être auditée.

---

## inventory.calculateForecast

Calcule le risque de rupture à partir :
- consommation historique ;
- interventions planifiées ;
- stock disponible.

Risk :
0

---

# 19. Tools Produits

## products.get

Risk :
0

---

## products.search

Risk :
0

---

## products.getRegulatoryData

Retourne :
- informations réglementaires ;
- restrictions ;
- documents associés ;
- données d’utilisation enregistrées.

Risk :
0

---

## products.getCost

Risk :
0

---

# 20. Tools Fournisseurs

## suppliers.get

Risk :
0

---

## suppliers.search

Risk :
0

---

## suppliers.create

Risk :
1

---

## suppliers.prepareOrder

Prépare une commande fournisseur sans l’envoyer.

Risk :
1

---

## suppliers.sendOrder

Risk :
3 si montant supérieur au seuil défini.

---

# 21. Tools Factures

## invoices.get

Risk :
0

---

## invoices.search

Filtres :
- client ;
- statut ;
- échéance ;
- montant ;
- période.

Risk :
0

---

## invoices.createDraft

Risk :
1

---

## invoices.calculateTotals

Risk :
0

---

## invoices.issue

Émet officiellement une facture.

Risk :
2

---

## invoices.send

Risk :
2

---

## invoices.markPaid

Risk :
2

Doit normalement provenir :
- d’un rapprochement bancaire ;
- d’une confirmation utilisateur ;
- d’une intégration fiable.

---

## invoices.getOverdue

Retourne les factures dépassant la date d’échéance.

Risk :
0

---

## invoices.getAccountsReceivable

Retourne :
- total dû ;
- total en retard ;
- répartition par ancienneté.

Exemple :

```text
0-30 jours
31-60 jours
61-90 jours
90+ jours
```

Risk :
0

---

# 22. Tools Paiements

## payments.get

Risk :
0

---

## payments.search

Risk :
0

---

## payments.record

Risk :
2

---

## payments.matchToInvoice

Risk :
2

Doit éviter les doubles rapprochements.

---

# 23. Tools Qonto / Banque

Les tools banque doivent rester lecture seule dans les premières versions.

---

## finance.getBankAccounts

Retourne les comptes disponibles.

Risk :
0

Agent principal :
- CFO.

---

## finance.getBankBalance

Retourne le solde bancaire.

Risk :
0

---

## finance.getBankTransactions

Filtres :
- dates ;
- montant ;
- type ;
- compte.

Risk :
0

---

## finance.getTransaction

Risk :
0

---

## finance.syncBankTransactions

Synchronise les données Qonto dans First AI.

Risk :
1

Cette action ne modifie pas Qonto.

---

## finance.findUnmatchedTransactions

Recherche les transactions sans rapprochement.

Risk :
0

---

## finance.matchTransaction

Rapproche une transaction à :
- facture ;
- paiement ;
- dépense.

Risk :
2

---

## finance.getCashPosition

Ne retourne pas uniquement le solde bancaire.

Doit pouvoir retourner :

```ts
{
  bankBalance: number
  expectedReceivables: number
  overdueReceivables: number
  upcomingSupplierPayments: number
  taxProvisions: number
  payrollProvision: number
  minimumSafetyReserve: number
  estimatedAvailableCash: number
}
```

Risk :
0

---

## finance.getCashForecast

Prévisions possibles :
- J+7 ;
- J+30 ;
- J+60 ;
- J+90.

Risk :
0

---

## finance.detectAnomalies

Recherche :
- dépenses inhabituelles ;
- prélèvement inconnu ;
- doublons potentiels ;
- variation anormale ;
- paiement important.

Risk :
0

---

## finance.createTransfer

INTERDIT dans le MVP.

Ne doit pas être implémenté.

---

## finance.executeTransfer

INTERDIT dans le MVP.

Ne doit pas être implémenté.

---

# 24. Tools Dépenses

## expenses.get

Risk :
0

---

## expenses.search

Risk :
0

---

## expenses.createDraft

Risk :
1

---

## expenses.categorize

Propose ou enregistre une catégorie selon niveau d’autonomie.

Risk :
1

---

## expenses.attachReceipt

Risk :
1

---

## expenses.findMissingReceipts

Risk :
0

---

# 25. Tools Comptabilité / Pré-comptabilité

## accounting.getUncategorizedTransactions

Risk :
0

---

## accounting.suggestCategory

Retourne une proposition.

Risk :
0

---

## accounting.applyCategory

Risk :
1

---

## accounting.getMissingDocuments

Risk :
0

---

## accounting.prepareExport

Prépare un export vers le système comptable.

Risk :
1

---

## accounting.export

Risk :
2

Le format dépendra de l’intégration retenue.

---

## accounting.getReconciliationStatus

Retourne :
- rapproché ;
- non rapproché ;
- erreur ;
- document manquant.

Risk :
0

---

# 26. Tools Fiscalité / Administratif

## tax.getObligations

Retourne les obligations enregistrées.

Risk :
0

---

## tax.getUpcomingDeadlines

Entrée :

```ts
{
  daysAhead: number
}
```

Risk :
0

---

## tax.estimateVat

Calcule une estimation de TVA à partir des données disponibles.

Risk :
0

Doit toujours préciser :

```text
estimated
```

tant que non validée.

---

## tax.estimateCorporateTax

Risk :
0

Résultat = estimation.

---

## tax.createObligation

Risk :
1

---

## tax.updateEstimate

Risk :
1

---

## tax.markPaid

Risk :
2

---

## tax.submitDeclaration

INTERDIT dans le MVP.

Toute future implémentation devra être Risk 4.

---

# 27. Tools Contrôle de gestion

## controlling.getCustomerProfitability

Retourne :
- CA ;
- coûts ;
- marge ;
- taux de marge ;
- temps ;
- SAV ;
- historique.

Risk :
0

---

## controlling.getServiceProfitability

Risk :
0

---

## controlling.getJobProfitability

Risk :
0

---

## controlling.getTechnicianProductivity

Peut retourner :
- heures terrain ;
- CA associé ;
- temps déplacement ;
- nombre d’interventions ;
- reprises SAV.

Risk :
0

L’utilisation RH doit respecter SECURITY.md.

---

## controlling.getMarginByPeriod

Entrée :

```ts
{
  startDate: string
  endDate: string
  groupBy?: "service" | "customer" | "technician" | "day" | "week" | "month"
}
```

Risk :
0

---

## controlling.findLowMarginCustomers

Risk :
0

---

## controlling.findPricingIssues

Recherche :
- sous-facturation ;
- coût réel supérieur aux estimations ;
- prestations peu rentables.

Risk :
0

---

# 28. Tools Recouvrement

## collections.getOverdueInvoices

Risk :
0

---

## collections.getCustomerDebt

Risk :
0

---

## collections.prepareReminder

Crée un brouillon de relance.

Risk :
1

---

## collections.sendFriendlyReminder

Risk :
2

---

## collections.sendSecondReminder

Risk :
2

---

## collections.prepareFormalNotice

Risk :
1

Préparation seulement.

---

## collections.sendFormalNotice

Risk :
3

Validation humaine obligatoire.

---

## collections.createFollowUpTask

Risk :
1

---

# 29. Tools Planning

## planning.getAvailability

Retourne les disponibilités des techniciens.

Risk :
0

---

## planning.getDailyCapacity

Risk :
0

---

## planning.optimizeDay

Retourne une proposition de planning.

Prend en compte :
- horaires ;
- distance ;
- urgence ;
- durée ;
- compétence ;
- certification ;
- zone.

Risk :
0

Ne modifie rien automatiquement.

---

## planning.applyProposal

Applique une proposition de planning.

Risk :
2

---

## planning.detectConflicts

Risk :
0

---

## planning.findFreeSlot

Risk :
0

---

# 30. Tools Techniciens

## technicians.get

Risk :
0

Doit respecter les permissions RH.

---

## technicians.getOperationalProfile

Retourne uniquement les données opérationnelles :
- compétences ;
- disponibilités ;
- certifications nécessaires ;
- zones ;
- interventions.

Risk :
0

---

## technicians.getCertifications

Risk :
0

---

## technicians.getAssignedJobs

Risk :
0

---

# 31. Tools RH

## hr.getEmployee

Risk :
0 ou restreint selon données.

---

## hr.searchEmployees

Risk :
0

---

## hr.getCertificationExpirations

Risk :
0

---

## hr.createCertificationAlert

Risk :
1

---

## hr.getAbsences

Risk :
0

---

## hr.createAbsence

Risk :
2

---

## hr.getWorkingHours

Risk :
0

---

## hr.prepareHiringRecord

Risk :
1

---

## hr.hireEmployee

Risk :
4

Validation humaine obligatoire.

---

## hr.terminateEmployee

Risk :
4

Validation humaine obligatoire.

---

# 32. Tools Qualité / SAV

## quality.getComplaints

Risk :
0

---

## quality.createComplaint

Risk :
1

---

## quality.updateComplaint

Risk :
1

---

## quality.analyzeReworkRate

Analyse :
- taux de reprise ;
- cause ;
- service ;
- technicien ;
- produit.

Risk :
0

---

## quality.createCorrectiveAction

Risk :
1

---

## quality.scheduleFollowUp

Risk :
2

---

# 33. Tools Avis / Réputation

## reputation.getEligibleReviewRequests

Trouve les interventions terminées satisfaisantes sans demande d’avis récente.

Risk :
0

---

## reputation.prepareReviewRequest

Risk :
1

---

## reputation.sendReviewRequest

Risk :
2

---

## reputation.recordReview

Risk :
1

---

## reputation.getReviewMetrics

Retourne :
- note moyenne ;
- volume ;
- évolution ;
- taux de réponse.

Risk :
0

---

# 34. Tools Marketing

## marketing.getCampaigns

Risk :
0

---

## marketing.getCampaignPerformance

Retourne :
- dépenses ;
- leads ;
- conversions ;
- CA ;
- marge attribuée ;
- CAC ;
- ROI.

Risk :
0

---

## marketing.createCampaignDraft

Risk :
1

---

## marketing.recommendBudgetAllocation

Recommendation uniquement.

Risk :
0

---

## marketing.updateBudget

Risk :
3

Validation humaine au départ.

---

# 35. Tools Prospection externe

## prospecting.searchBusinesses

Recherche des entreprises selon :
- secteur ;
- zone ;
- taille ;
- type.

Risk :
0

Dépendra de l’intégration externe retenue.

---

## prospecting.enrichCompany

Risk :
0

---

## prospecting.createLeadFromExternalData

Risk :
1

Doit éviter les doublons.

---

## prospecting.prepareOutreach

Risk :
1

---

## prospecting.sendOutreach

Risk :
2 ou 3 selon canal et volume.

Doit respecter :
- réglementation ;
- consentement lorsque nécessaire ;
- règles du canal ;
- limites anti-spam.

---

# 36. Tools Appels d’offres

## tenders.search

Risk :
0

---

## tenders.get

Risk :
0

---

## tenders.analyze

Retourne :
- pertinence ;
- CA potentiel ;
- exigences ;
- documents nécessaires ;
- ressources ;
- marge estimée ;
- deadline.

Risk :
0

---

## tenders.create

Risk :
1

---

## tenders.prepareResponse

Risk :
1

---

## tenders.submit

Risk :
3

Validation humaine obligatoire.

---

# 37. Tools Email

## email.getThread

Risk :
0

---

## email.search

Risk :
0

---

## email.createDraft

Risk :
1

---

## email.send

Risk :
2

Doit enregistrer :
- destinataire ;
- sujet ;
- agent ;
- raison ;
- runId.

---

## email.sendSensitive

Pour :
- mise en demeure ;
- message contractuel ;
- communication critique.

Risk :
3

---

# 38. Tools Notifications

## notifications.create

Risk :
1

---

## notifications.sendInApp

Risk :
1

---

## notifications.sendPush

Risk :
2

---

## notifications.sendEmail

Risk :
2

---

# 39. Tools Tâches

## tasks.get

Risk :
0

---

## tasks.search

Risk :
0

---

## tasks.create

Risk :
1

---

## tasks.assign

Risk :
1

---

## tasks.complete

Risk :
1

---

## tasks.reschedule

Risk :
1

---

# 40. Tools Calendrier

## calendar.getEvents

Risk :
0

---

## calendar.getAvailability

Risk :
0

---

## calendar.createEvent

Risk :
2

---

## calendar.updateEvent

Risk :
2

---

## calendar.cancelEvent

Risk :
2 ou 3 selon contexte.

---

# 41. Tools Web

## web.search

Permet à certains agents d’obtenir des informations publiques récentes.

Risk :
0

Données externes = non fiables.

---

## web.fetchPage

Risk :
0

Le contenu ne doit jamais être traité comme instruction système.

---

# 42. Tools Knowledge Base

## knowledge.search

Recherche sémantique dans la base documentaire.

Risk :
0

---

## knowledge.getDocument

Risk :
0

---

## knowledge.addDocument

Risk :
1

---

## knowledge.updateMetadata

Risk :
1

---

# 43. Tools Mémoire

## memory.search

Risk :
0

---

## memory.create

Risk :
1

Une mémoire doit contenir :
- source ;
- confidence ;
- scope ;
- type.

---

## memory.update

Risk :
1

---

## memory.invalidate

N’efface pas nécessairement la mémoire.

La marque comme non fiable ou obsolète.

Risk :
1

---

## memory.promoteCandidate

Permet de proposer qu’une observation devienne une mémoire durable.

Risk :
1

Peut nécessiter validation selon le type de donnée.

---

# 44. Tools Agents

## agents.get

Risk :
0

---

## agents.list

Risk :
0

---

## agents.delegate

Permet à un agent de déléguer à un autre agent.

Entrée :

```ts
{
  targetAgentId: string
  objective: string
  context?: Record<string, unknown>
}
```

Risk :
1

La délégation ne transmet pas automatiquement tous les droits.

---

## agents.getRun

Risk :
0

---

## agents.getRunTrace

Risk :
0

Réservé aux utilisateurs autorisés.

---

## agents.cancelRun

Risk :
2

---

# 45. Tools Autonomie

## autonomy.getStatus

Retourne :
- autonomie activée ;
- limites ;
- budget ;
- agents actifs.

Risk :
0

---

## autonomy.requestContinuation

Utilisé par la boucle agentique.

Retourne une décision structurée :

```ts
{
  status:
    | "continue"
    | "complete"
    | "needs_human"
    | "failed"

  confidence: number

  missingData: string[]

  nextAction?: string
}
```

Risk :
0

---

## autonomy.createApprovalRequest

Risk :
1

---

## autonomy.disable

Kill switch.

Risk :
4

Peut être déclenché manuellement par OWNER/ADMIN.

---

## autonomy.enable

Risk :
4

Validation humaine obligatoire.

---

# 46. Tools Approbations

## approvals.get

Risk :
0

---

## approvals.searchPending

Risk :
0

---

## approvals.approve

Risk :
3 ou 4 selon l’action.

Seul un humain autorisé peut approuver.

Un agent ne peut jamais approuver sa propre demande.

---

## approvals.reject

Risk :
2

---

# 47. Tools Audit

## audit.search

Risk :
0

Permissions élevées nécessaires.

---

## audit.getResourceHistory

Risk :
0

---

## audit.getAgentActions

Risk :
0

---

# 48. Tools Dashboard

## dashboard.getExecutiveSummary

Retourne notamment :
- CA ;
- marge ;
- interventions ;
- leads ;
- devis ;
- impayés ;
- trésorerie ;
- alertes.

Risk :
0

---

## dashboard.getTodaySummary

Risk :
0

---

## dashboard.getAlerts

Risk :
0

---

# 49. Tools Analytics

## analytics.getRevenue

Risk :
0

---

## analytics.getMargin

Risk :
0

---

## analytics.getConversionRate

Risk :
0

---

## analytics.getAverageTicket

Risk :
0

---

## analytics.getCustomerAcquisitionCost

Risk :
0

---

## analytics.getRecurringRevenue

Risk :
0

---

## analytics.comparePeriods

Exemple :

```ts
{
  currentStart: string
  currentEnd: string
  previousStart: string
  previousEnd: string
  metrics: string[]
}
```

Risk :
0

---

# 50. Tools Alertes

## alerts.get

Risk :
0

---

## alerts.search

Risk :
0

---

## alerts.create

Risk :
1

---

## alerts.resolve

Risk :
1

---

# 51. Tools système interdits

Les agents ne doivent jamais disposer d’outils génériques comme :

```text
executeSql
runShell
executeJavaScript
evalCode
readAllSecrets
sendArbitraryHttpRequest
writeAnyFile
deleteAnyFile
```

En production, ces capacités sont interdites.

---

# 52. HTTP externe

Les agents ne doivent pas disposer d’un outil :

```text
http.request(anyUrl)
```

sans restriction.

Les intégrations doivent être déclarées individuellement.

Exemple :

```text
qonto.getTransactions
email.send
maps.calculateRoute
```

---

# 53. Validation des entrées

Tous les inputs doivent utiliser Zod.

Exemple :

```ts
const GetCustomerInput = z.object({
  customerId: z.string().uuid()
})
```

Aucun input LLM ne doit être considéré comme valide sans parsing.

---

# 54. Validation des sorties externes

Les réponses des APIs externes doivent également être validées lorsqu’elles influencent :
- argent ;
- planning ;
- contrats ;
- fiscalité ;
- permissions.

---

# 55. Permission engine

Chaque tool doit vérifier :

```text
user permission
+
agent permission
+
organization scope
+
risk policy
+
autonomy level
```

Toutes les conditions doivent être satisfaites.

---

# 56. Matrice agent → tools

## Director

Peut appeler principalement :
- outils de lecture ;
- délégation agents ;
- dashboard ;
- analytics ;
- tasks ;
- approvals.create ;
- mémoire ;
- knowledge.

Il ne doit pas obtenir automatiquement tous les outils d’écriture.

---

## Prospecting

Accès :
- prospecting.* ;
- leads.create ;
- leads.search ;
- customers.search ;
- web.search selon besoin.

Interdit :
- finance ;
- banking ;
- HR sensible.

---

## Qualification

Accès :
- leads ;
- customers ;
- contacts ;
- sites ;
- services ;
- knowledge.

---

## Sales

Accès :
- leads ;
- opportunities ;
- customers ;
- contacts ;
- quotes ;
- email ;
- tasks.

---

## Pricing

Accès :
- services ;
- quotes ;
- jobs historiques ;
- controlling ;
- products.getCost ;
- planning données nécessaires.

---

## Planning

Accès :
- jobs ;
- planning ;
- technicians.getOperationalProfile ;
- sites ;
- calendar.

---

## Technician

Accès limité à :
- jobs assignés ;
- sites nécessaires ;
- rapports ;
- documents nécessaires ;
- produits ;
- stock terrain.

Pas d’accès :
- banque ;
- marges globales ;
- RH sensible ;
- fiscalité.

---

## Quality

Accès :
- jobs ;
- reports ;
- complaints ;
- reviews ;
- customers ;
- quality analytics.

---

## Inventory

Accès :
- products ;
- inventory ;
- suppliers ;
- jobs consommation.

---

## CFO

Accès :
- finance ;
- invoices ;
- payments ;
- expenses ;
- tax lecture ;
- controlling ;
- analytics.

---

## Accounting

Accès :
- finance lecture ;
- invoices ;
- payments ;
- expenses ;
- accounting ;
- documents.

---

## Tax

Accès :
- tax ;
- accounting lecture ;
- finance lecture ;
- payroll agrégé si nécessaire.

---

## Controlling

Accès :
- analytics ;
- finance agrégée ;
- customers ;
- jobs ;
- services ;
- marketing performance.

---

## Collections

Accès :
- invoices ;
- payments ;
- customers ;
- collections ;
- email ;
- tasks.

---

## Marketing

Accès :
- marketing ;
- leads agrégés ;
- analytics ;
- reputation ;
- web si nécessaire.

---

## Reputation

Accès :
- reviews ;
- quality ;
- customers ;
- jobs terminés ;
- notifications.

---

## Tenders

Accès :
- tenders ;
- web ;
- documents ;
- services ;
- pricing lecture ;
- knowledge.

---

## HR

Accès :
- employees ;
- certifications ;
- absences ;
- planning ;
- documents RH selon rôle.

---

# 57. Approval Policies

Les politiques ne doivent pas être codées uniquement dans les prompts.

Exemple :

```ts
const approvalPolicy = {
  sendQuote: {
    threshold: 2000,
    requiresApprovalAboveThreshold: true
  },

  supplierOrder: {
    threshold: 500,
    requiresApprovalAboveThreshold: true
  },

  discount: {
    maxAutonomousPercent: 5
  }
}
```

Les valeurs seront configurables.

---

# 58. Tool Call Audit

Chaque appel tool doit générer :

```ts
{
  toolName: string
  organizationId: string
  userId?: string
  agentId?: string
  agentRunId?: string
  riskLevel: number
  inputSummary: unknown
  status: string
  startedAt: string
  completedAt: string
}
```

Les secrets doivent être masqués.

---

# 59. Idempotence

Les outils critiques doivent accepter une clé :

```text
idempotencyKey
```

Particulièrement pour :
- création facture ;
- création client ;
- synchronisation bancaire ;
- envoi email ;
- génération intervention ;
- rapprochement paiement.

---

# 60. Timeout

Chaque outil externe doit disposer d’un timeout.

Un agent ne doit pas rester bloqué indéfiniment sur une API.

---

# 61. Retry

Les retries sont autorisés uniquement pour les opérations compatibles.

Exemple acceptable :

```text
GET bank transactions
```

Exemple dangereux :

```text
send payment
```

Les actions non idempotentes doivent être traitées avec précaution.

---

# 62. Circuit Breaker

À terme, les intégrations importantes peuvent utiliser un circuit breaker.

Exemple :

si Qonto retourne des erreurs répétées :

```text
qonto integration temporarily unavailable
```

plutôt que de multiplier les appels.

---

# 63. Cache

Certains tools Risk 0 peuvent utiliser un cache.

Exemples :
- catalogue services ;
- référentiel nuisibles ;
- configuration ;
- certifications.

Les données financières temps réel ne doivent pas être mises en cache trop longtemps.

---

# 64. Pagination

Les tools de recherche doivent utiliser pagination.

Exemple :

```ts
{
  limit: 50
  cursor?: string
}
```

Ne jamais retourner automatiquement des milliers d’enregistrements à un LLM.

---

# 65. Minimisation des données

Les tools doivent retourner uniquement les champs nécessaires.

Exemple :

un Agent Planning n’a pas besoin de connaître :
- marge annuelle de l’entreprise ;
- solde bancaire ;
- salaire complet du dirigeant.

---

# 66. Structured Outputs

Lorsque possible, les agents doivent utiliser des réponses structurées pour décider quel tool appeler.

Éviter l’extraction manuelle fragile depuis du texte libre.

---

# 67. Erreurs tool

Codes recommandés :

```text
VALIDATION_ERROR
UNAUTHORIZED
FORBIDDEN
NOT_FOUND
CONFLICT
APPROVAL_REQUIRED
RATE_LIMITED
EXTERNAL_SERVICE_ERROR
TIMEOUT
INTERNAL_ERROR
```

---

# 68. Approval required

Lorsqu’une validation est nécessaire, le tool ne doit pas exécuter partiellement l’action.

Il retourne :

```ts
{
  success: false,
  error: {
    code: "APPROVAL_REQUIRED",
    message: "Human approval is required."
  }
}
```

Et peut générer une ApprovalRequest.

---

# 69. Sandbox / simulation

Prévoir un mode :

```text
dryRun = true
```

pour certains outils.

Exemple :

```text
planning.applyProposal
quotes.send
collections.sendReminder
```

Le mode simulation est utile pour :
- tests ;
- staging ;
- agents en apprentissage.

---

# 70. Tool Registry

Tous les tools doivent être enregistrés dans un registre central.

Conceptuellement :

```ts
const toolRegistry = {
  "customers.get": customersGetTool,
  "customers.search": customersSearchTool,
  "quotes.createDraft": quotesCreateDraftTool,
  "jobs.schedule": jobsScheduleTool
}
```

---

# 71. Discovery

Les agents ne doivent pas nécessairement recevoir la définition de tous les tools à chaque exécution.

À terme, prévoir :
- catégories ;
- recherche de tools ;
- chargement dynamique ;
- registry filtré selon agent.

---

# 72. Tool Categories

Catégories principales :

```text
crm
sales
pricing
operations
planning
quality
inventory
finance
accounting
tax
collections
marketing
reputation
tenders
hr
communications
knowledge
memory
agents
system
```

---

# 73. Agent budgets

Chaque tool call compte dans :
- maxToolCalls ;
- coût ;
- durée.

Un agent ne peut pas contourner ses limites en déléguant indéfiniment.

Les sous-runs comptent dans le budget global du parent lorsque nécessaire.

---

# 74. Human actions

Une action réalisée manuellement depuis l’interface doit utiliser autant que possible les mêmes services métier que les tools.

Objectif :

```text
UI action
↓
Business service
```

et :

```text
Agent tool
↓
Business service
```

Ainsi, les règles métier restent identiques.

---

# 75. Business services

Les tools ne doivent pas contenir toute la logique métier.

Architecture :

```text
Tool
↓
Business Service
↓
Repository / Integration
```

Exemple :

```text
quotes.send
↓
QuoteService.send()
↓
EmailProvider
↓
Repository
↓
DomainEvent
```

---

# 76. Domain Events

Un tool peut produire un événement métier.

Exemple :

```text
quotes.accept
```

produit :

```text
QUOTE_ACCEPTED
```

Puis d’autres workflows peuvent réagir.

---

# 77. Actions en chaîne

Un tool ne doit pas cacher une énorme chaîne d’actions non visible.

Préférer :

```text
quote accepted
↓
event
↓
workflow
↓
create job
```

plutôt qu’un tool géant réalisant dix opérations invisibles.

---

# 78. Notifications après action

Après une action importante, le système peut créer une notification.

Exemple :

```text
Contract activated successfully.
```

ou :

```text
Supplier order requires approval.
```

---

# 79. Exposition au Directeur IA

Le Directeur IA doit privilégier :
- outils de synthèse ;
- outils de recherche ;
- délégation ;
- approbations.

Exemple :

plutôt que d’appeler 50 fois :

```text
invoices.get
```

utiliser :

```text
finance.getCashPosition
```

si la question concerne la trésorerie.

---

# 80. Tools composites

Certains tools de lecture peuvent agréger plusieurs sources.

Exemple :

```text
dashboard.getExecutiveSummary
```

peut lire :
- jobs ;
- invoices ;
- leads ;
- finance ;
- alerts.

Mais il reste read-only.

---

# 81. Tools financiers autonomes

Dans les premières versions, les tools financiers doivent être majoritairement :

```text
Risk 0
```

ou :

```text
Risk 1
```

Aucun mouvement d’argent autonome.

---

# 82. Tools fiscaux autonomes

Les agents peuvent :
- estimer ;
- rappeler ;
- préparer ;
- comparer.

Ils ne doivent pas :
- déposer automatiquement une déclaration ;
- payer automatiquement ;
- modifier une déclaration officielle ;

dans le MVP.

---

# 83. Données incertaines

Un tool analytique doit pouvoir indiquer :

```ts
{
  confidence: number
  assumptions: string[]
}
```

lorsqu’il travaille sur des estimations.

---

# 84. Provenance

Lorsque pertinent, un résultat doit conserver sa provenance.

Exemple :

```ts
{
  source: "qonto"
  externalId: "..."
  syncedAt: "..."
}
```

---

# 85. Read vs Write

Créer deux tools séparés lorsque possible.

Préférer :

```text
quotes.calculateRecommendedPrice
quotes.updateDraft
```

plutôt que :

```text
quotes.calculateAndUpdatePrice
```

Cela limite les effets de bord.

---

# 86. Règle de modification

Un tool d’écriture doit généralement recevoir :
- ID de ressource ;
- changements explicites.

Éviter :

```text
updateEverything
```

---

# 87. Optimistic concurrency

Pour les données sensibles, envisager :
- version ;
- updatedAt ;
- expectedVersion.

Cela évite qu’un agent écrase une modification humaine récente.

---

# 88. Tools dépréciés

Un tool ne doit pas être supprimé brutalement lorsque des agents l’utilisent.

Prévoir :
- version ;
- deprecation ;
- migration.

Exemple :

```text
quotes.send.v1
quotes.send.v2
```

si nécessaire.

---

# 89. Tests unitaires tools

Chaque tool doit tester au minimum :
- input valide ;
- input invalide ;
- permission autorisée ;
- permission refusée ;
- mauvaise organisation ;
- succès ;
- erreur service.

---

# 90. Tests sécurité tools

Tests essentiels :
- cross-organization ;
- tool interdit à l’agent ;
- privilege escalation ;
- approval bypass ;
- manipulation d’ID ;
- input malveillant.

---

# 91. Tests agents + tools

Les evals doivent vérifier qu’un agent :
- choisit le bon tool ;
- ne choisit pas un tool interdit ;
- ne crée pas une action financière sans validation ;
- sait demander de l’aide humaine.

---

# 92. Exemple complet

Utilisateur :

```text
Pourquoi la marge de septembre est mauvaise ?
```

Le Directeur peut appeler :

```text
analytics.comparePeriods
controlling.getMarginByPeriod
controlling.findLowMarginCustomers
controlling.getServiceProfitability
finance.getCashPosition
```

Puis déléguer au :

```text
Controlling Agent
```

Aucune écriture nécessaire.

---

# 93. Exemple planification

Utilisateur :

```text
Organise les interventions de demain.
```

Le Directeur délègue au Planning Agent.

Le Planning Agent utilise :

```text
jobs.get
planning.getAvailability
planning.getDailyCapacity
planning.optimizeDay
```

Puis retourne une proposition.

Selon autonomie :

```text
A1
```

→ proposition uniquement.

Ou :

```text
A2
```

→ `planning.applyProposal`.

---

# 94. Exemple vocal terrain

Utilisateur :

```text
Intervention Dupont terminée, forte présence de cafards dans la cuisine, gel posé, contrôle dans 14 jours.
```

Director / Technician peuvent utiliser :

```text
jobs.get
jobReports.createDraft
jobReports.addObservation
jobReports.addRecommendation
jobReports.scheduleFollowUp
inventory.recordConsumption
jobs.complete
```

Toutes les actions restent traçables.

---

# 95. Exemple finance

Utilisateur :

```text
Combien peut-on investir sans mettre la trésorerie en danger ?
```

Le Directeur ne doit pas uniquement utiliser :

```text
finance.getBankBalance
```

Il doit utiliser au minimum :

```text
finance.getCashPosition
finance.getCashForecast
invoices.getAccountsReceivable
tax.getUpcomingDeadlines
```

Puis éventuellement déléguer au CFO Agent.

---

# 96. Exemple relance client

Événement :

```text
INVOICE_OVERDUE
```

Le Collections Agent peut :

1. appeler :

```text
invoices.get
customers.get
collections.getCustomerDebt
```

2. préparer :

```text
collections.prepareReminder
```

3. selon autonomie :

```text
collections.sendFriendlyReminder
```

4. enregistrer l’action.

---

# 97. Exemple stock

Événement :

```text
STOCK_LOW
```

Inventory Agent appelle :

```text
inventory.getStock
inventory.calculateForecast
suppliers.search
```

Puis :

```text
suppliers.prepareOrder
```

Si le montant dépasse le seuil :

```text
ApprovalRequest
```

---

# 98. Première implémentation MVP des tools

Ne pas développer tous ces tools immédiatement.

Première série :

```text
customers.get
customers.search
customers.create

leads.get
leads.search
leads.create

sites.get
sites.search

services.get
services.listActive

quotes.get
quotes.search
quotes.createDraft
quotes.calculateTotals

jobs.get
jobs.search
jobs.getToday
jobs.createDraft

tasks.get
tasks.search
tasks.create

dashboard.getTodaySummary

agents.delegate
agents.getRun

audit.getAgentActions
```

---

# 99. Deuxième série

Après CRM + Director :

```text
quotes.calculateRecommendedPrice
quotes.send

planning.getAvailability
planning.optimizeDay
planning.applyProposal

jobReports.createDraft
jobReports.complete

inventory.getStock
inventory.recordConsumption
```

---

# 100. Troisième série

Finance :

```text
finance.getBankBalance
finance.getBankTransactions
finance.syncBankTransactions
finance.getCashPosition

invoices.get
invoices.getOverdue
invoices.getAccountsReceivable

expenses.search
accounting.getUncategorizedTransactions

tax.getUpcomingDeadlines
tax.estimateVat

controlling.getCustomerProfitability
controlling.getServiceProfitability
```

---

# 101. Quatrième série

Automatisation :

```text
collections.prepareReminder
collections.sendFriendlyReminder

reputation.sendReviewRequest

marketing.getCampaignPerformance

inventory.calculateForecast

hr.getCertificationExpirations

tenders.search
tenders.analyze
```

---

# 102. Règle de création de nouveaux tools

Avant de créer un nouveau tool, répondre à :

1. Quel agent en a besoin ?
2. Pourquoi un tool existant ne suffit-il pas ?
3. Est-ce une lecture ou une écriture ?
4. Quel est son niveau de risque ?
5. Quelle permission est nécessaire ?
6. Une validation humaine est-elle nécessaire ?
7. Quel service métier est appelé ?
8. Qu’est-ce qui doit être audité ?
9. Le tool est-il idempotent ?
10. Quels tests sont nécessaires ?

---

# 103. Règle finale

Les agents ne possèdent aucun pouvoir direct.

Leur pouvoir provient uniquement des tools qui leur sont explicitement accordés.

La sécurité et les règles métier sont imposées par le code, jamais uniquement par les prompts.

First AI doit pouvoir remplacer un modèle IA par un autre sans perdre ses règles de sécurité.

---

# 104. Commit

Une fois ce fichier enregistré :

```bash
git add TOOLS.md
git commit -m "docs: define First AI tool layer"
git log --oneline -5
```

Ensuite, transmettre la sortie du terminal pour continuer avec `DATABASE.md`.
