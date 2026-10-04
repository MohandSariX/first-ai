# First AI — Modèle métier

## 1. Objectif

Ce document définit les principales entités métier de First AI.

Il sert de référence pour :
- la base PostgreSQL ;
- les services métier ;
- les outils des agents ;
- les APIs ;
- les règles de sécurité ;
- les workflows ;
- les tests ;
- les futures migrations.

Les noms et relations définis ici doivent rester stables autant que possible.

---

## 2. Organisation

### Organization

Représente l’entreprise utilisant First AI.

Champs principaux :
- id
- name
- legalName
- siret
- vatNumber
- email
- phone
- address
- timezone
- currency
- createdAt
- updatedAt

Une organisation possède :
- des utilisateurs ;
- des employés ;
- des clients ;
- des interventions ;
- des contrats ;
- des factures ;
- des agents IA ;
- des paramètres.

Même si First AI commence pour une seule entreprise, le modèle doit rester compatible multi-organisation.

---

## 3. Utilisateurs

### User

Personne ayant accès à First AI.

Exemples :
- dirigeant ;
- associé ;
- manager ;
- technicien ;
- comptable.

Champs :
- id
- organizationId
- authUserId
- firstName
- lastName
- email
- phone
- role
- isActive
- createdAt
- updatedAt

Rôles principaux :
- OWNER
- ADMIN
- MANAGER
- TECHNICIAN
- ACCOUNTANT
- READ_ONLY

---

## 4. Employés

### Employee

Représente une personne travaillant pour l’entreprise.

Un Employee peut éventuellement être lié à un User.

Champs :
- id
- organizationId
- userId nullable
- firstName
- lastName
- email
- phone
- employeeType
- status
- hireDate
- endDate
- hourlyCost
- notes

Types :
- employee
- contractor
- owner

Statuts :
- active
- inactive
- suspended

---

## 5. Certifications

### Certification

Certification ou formation détenue par un employé.

Exemples :
- Certibiocide nuisibles ;
- SST ;
- habilitation spécifique ;
- formation interne.

Champs :
- id
- organizationId
- employeeId
- type
- name
- certificateNumber
- issuedAt
- expiresAt
- documentId
- status

Statuts :
- valid
- expiring
- expired
- pending

---

## 6. Prospects

### Lead

Représente un prospect non encore converti.

Champs :
- id
- organizationId
- source
- type
- companyName
- firstName
- lastName
- email
- phone
- address
- city
- postalCode
- status
- score
- assignedTo
- estimatedValue
- notes
- createdAt
- updatedAt

Sources possibles :
- website
- phone
- google_ads
- referral
- outbound
- tender
- manual
- other

Statuts :
- new
- contacted
- qualified
- proposal
- won
- lost
- archived

---

## 7. Opportunités commerciales

### Opportunity

Représente une opportunité commerciale qualifiée.

Champs :
- id
- organizationId
- leadId nullable
- customerId nullable
- name
- stage
- probability
- estimatedAmount
- expectedCloseDate
- assignedTo
- lostReason
- notes

Stages :
- qualification
- discovery
- quote
- negotiation
- won
- lost

---

## 8. Clients

### Customer

Représente un client.

Peut être :
- particulier ;
- entreprise ;
- restaurant ;
- hôtel ;
- syndic ;
- copropriété ;
- commerce ;
- collectivité ;
- agence immobilière.

Champs :
- id
- organizationId
- type
- name
- legalName
- siret
- vatNumber
- billingEmail
- phone
- paymentTermsDays
- status
- riskLevel
- notes
- createdAt
- updatedAt

Types :
- individual
- company
- property_manager
- restaurant
- hotel
- retail
- public
- other

Statuts :
- active
- inactive
- blocked
- prospect

---

## 9. Contacts

### Contact

Personne liée à un client.

Exemples :
- responsable restaurant ;
- syndic ;
- gardien ;
- directeur hôtel ;
- comptable.

Champs :
- id
- organizationId
- customerId
- firstName
- lastName
- role
- email
- phone
- isPrimary
- notes

---

## 10. Sites

### CustomerSite

Lieu physique où une prestation est réalisée.

Un client peut avoir plusieurs sites.

Exemples :
- restaurant ;
- copropriété ;
- entrepôt ;
- logement ;
- bureau.

Champs :
- id
- organizationId
- customerId
- name
- address
- city
- postalCode
- latitude
- longitude
- accessInstructions
- accessHours
- contactId
- notes

---

## 11. Types de nuisibles

### PestType

Référentiel métier.

Exemples :
- rat
- mouse
- cockroach
- bed_bug
- ant
- fly
- wasp
- moth
- flea
- other

Champs :
- id
- code
- name
- category
- active

---

## 12. Niveau d’infestation

Référentiel logique utilisé dans les interventions.

Valeurs :
- unknown
- low
- medium
- high
- critical

---

## 13. Services

### Service

Catalogue des prestations vendues.

Exemples :
- diagnostic rongeurs ;
- dératisation ;
- traitement cafards ;
- traitement punaises ;
- inspection ;
- monitoring ;
- contrat annuel ;
- remise en état.

Champs :
- id
- organizationId
- code
- name
- category
- description
- pricingMode
- basePrice
- estimatedDurationMinutes
- active

Pricing modes :
- fixed
- hourly
- unit
- custom
- subscription

---

## 14. Produits

### Product

Produit ou consommable utilisé.

Exemples :
- gel insecticide ;
- rodenticide ;
- piège ;
- poste sécurisé ;
- EPI ;
- consommable.

Champs :
- id
- organizationId
- sku
- name
- category
- supplierId
- purchasePrice
- unit
- minimumStock
- active
- regulatoryData
- notes

---

## 15. Fournisseurs

### Supplier

Champs :
- id
- organizationId
- name
- contactName
- email
- phone
- website
- paymentTerms
- notes

---

## 16. Stock

### StockLocation

Lieu de stockage.

Exemples :
- dépôt ;
- véhicule ;
- bureau.

Champs :
- id
- organizationId
- name
- type

### StockMovement

Mouvement de stock.

Champs :
- id
- organizationId
- productId
- stockLocationId
- type
- quantity
- unitCost
- jobId nullable
- supplierId nullable
- createdAt
- createdBy

Types :
- purchase
- consumption
- transfer
- adjustment
- return
- waste

---

## 17. Devis

### Quote

Champs :
- id
- organizationId
- customerId
- siteId
- opportunityId nullable
- quoteNumber
- status
- subtotal
- taxAmount
- total
- estimatedCost
- estimatedMargin
- validUntil
- sentAt
- acceptedAt
- rejectedAt
- createdBy
- notes

Statuts :
- draft
- ready
- sent
- viewed
- accepted
- rejected
- expired
- cancelled

---

## 18. Lignes de devis

### QuoteItem

Champs :
- id
- quoteId
- serviceId nullable
- description
- quantity
- unitPrice
- taxRate
- costEstimate
- sortOrder

---

## 19. Contrats

### Contract

Contrat récurrent.

Exemples :
- prévention nuisibles restaurant ;
- copropriété ;
- hôtel ;
- contrat multi-sites.

Champs :
- id
- organizationId
- customerId
- siteId nullable
- name
- status
- startDate
- endDate nullable
- billingFrequency
- billingAmount
- visitFrequency
- autoRenew
- noticePeriodDays
- signedDocumentId
- notes

Statuts :
- draft
- active
- suspended
- terminated
- expired

---

## 20. Interventions

### Job

Unité principale d’exécution terrain.

Champs :
- id
- organizationId
- customerId
- siteId
- contractId nullable
- quoteId nullable
- serviceId
- pestTypeId nullable
- infestationLevel
- status
- priority
- scheduledStart
- scheduledEnd
- actualStart
- actualEnd
- assignedEmployeeId
- price
- estimatedCost
- actualCost
- estimatedMargin
- actualMargin
- description
- internalNotes
- customerNotes
- createdAt
- updatedAt

Statuts :
- draft
- scheduled
- confirmed
- en_route
- in_progress
- completed
- follow_up_required
- cancelled
- failed

Priorités :
- low
- normal
- high
- urgent

---

## 21. Rapport d’intervention

### JobReport

Champs :
- id
- organizationId
- jobId
- technicianId
- observations
- infestationLevelBefore
- infestationLevelAfter
- treatmentPerformed
- productsUsedSummary
- recommendations
- followUpRequired
- followUpDate
- customerSignature
- completedAt

---

## 22. Produits utilisés lors d’une intervention

### JobProductUsage

Champs :
- id
- jobId
- productId
- quantity
- unitCost

Permet de calculer le coût réel par intervention.

---

## 23. Photos et fichiers

### Document

Objet générique pour les fichiers.

Champs :
- id
- organizationId
- type
- storagePath
- filename
- mimeType
- size
- uploadedBy
- createdAt
- metadata

Types :
- photo
- invoice
- quote
- contract
- certification
- supplier_invoice
- safety_document
- other

---

## 24. Factures

### Invoice

Champs :
- id
- organizationId
- customerId
- contractId nullable
- jobId nullable
- quoteId nullable
- invoiceNumber
- status
- issueDate
- dueDate
- subtotal
- taxAmount
- total
- amountPaid
- amountDue
- sentAt
- paidAt
- accountingReference
- notes

Statuts :
- draft
- issued
- sent
- partially_paid
- paid
- overdue
- cancelled
- written_off

---

## 25. Paiements

### Payment

Champs :
- id
- organizationId
- invoiceId nullable
- customerId
- bankTransactionId nullable
- amount
- method
- paidAt
- reference
- status

Méthodes :
- card
- bank_transfer
- cash
- direct_debit
- cheque
- other

---

## 26. Transactions bancaires

### BankTransaction

Champs :
- id
- organizationId
- externalId
- bankProvider
- accountId
- type
- amount
- currency
- label
- counterparty
- transactionDate
- status
- rawData
- importedAt

Dans un premier temps :
- import lecture seule depuis Qonto.

---

## 27. Dépenses

### Expense

Champs :
- id
- organizationId
- supplierId nullable
- bankTransactionId nullable
- documentId nullable
- category
- amountExclTax
- taxAmount
- totalAmount
- expenseDate
- status
- accountingCategory
- notes

---

## 28. Obligations fiscales et administratives

### TaxObligation

Champs :
- id
- organizationId
- type
- period
- estimatedAmount
- actualAmount
- dueDate
- status
- documentId nullable
- notes

Types :
- VAT
- CORPORATE_TAX
- CFE
- URSSAF
- PAYROLL
- OTHER

Statuts :
- estimated
- pending
- ready
- paid
- overdue

---

## 29. Tâches

### Task

Tâche interne.

Peut être créée par :
- utilisateur ;
- agent ;
- système.

Champs :
- id
- organizationId
- title
- description
- status
- priority
- assignedUserId nullable
- assignedAgentId nullable
- dueAt
- sourceType
- sourceId
- createdByType
- createdById
- createdAt
- completedAt

---

## 30. Alertes

### Alert

Champs :
- id
- organizationId
- type
- severity
- title
- message
- entityType
- entityId
- status
- createdAt
- resolvedAt

Severities :
- info
- warning
- critical

---

## 31. Avis clients

### CustomerReview

Champs :
- id
- organizationId
- customerId
- jobId nullable
- platform
- rating
- comment
- reviewUrl
- requestedAt
- receivedAt
- status

---

## 32. Campagnes marketing

### MarketingCampaign

Champs :
- id
- organizationId
- name
- channel
- status
- budget
- spend
- leadsGenerated
- customersGenerated
- revenueAttributed
- marginAttributed
- startDate
- endDate

Canaux :
- google_ads
- seo
- email
- outbound
- referral
- social
- other

---

## 33. Appels d’offres

### Tender

Champs :
- id
- organizationId
- source
- title
- buyer
- estimatedValue
- deadline
- status
- url
- fitScore
- estimatedMargin
- notes

Statuts :
- discovered
- analyzing
- relevant
- preparing
- submitted
- won
- lost
- ignored

---

## 34. Agent IA

### Agent

Définition d’un agent dans le système.

Champs :
- id
- organizationId nullable
- code
- name
- version
- status
- autonomyLevel
- configuration
- createdAt
- updatedAt

---

## 35. Exécution d’un agent

### AgentRun

Champs :
- id
- organizationId
- agentId
- parentRunId nullable
- triggeredByType
- triggeredById
- objective
- status
- startedAt
- completedAt
- iterationCount
- toolCallCount
- inputTokens
- outputTokens
- estimatedCost
- finalOutput
- error

Statuts :
- queued
- running
- waiting_approval
- completed
- failed
- cancelled

---

## 36. Étapes agentiques

### AgentStep

Champs :
- id
- agentRunId
- sequence
- type
- input
- output
- startedAt
- completedAt
- status

Types possibles :
- observation
- planning
- tool_call
- delegation
- critique
- decision
- final

---

## 37. Appels d’outils

### AgentToolCall

Champs :
- id
- organizationId
- agentRunId
- agentId
- toolName
- input
- output
- status
- startedAt
- completedAt
- error
- approvalRequired
- approvalRequestId nullable

---

## 38. Demandes de validation

### ApprovalRequest

Champs :
- id
- organizationId
- type
- requestedByAgentId nullable
- requestedByUserId nullable
- resourceType
- resourceId nullable
- description
- proposedAction
- riskLevel
- status
- requestedAt
- expiresAt
- resolvedAt
- resolvedBy

Statuts :
- pending
- approved
- rejected
- expired

---

## 39. Mémoire IA

### Memory

Champs :
- id
- organizationId
- type
- scope
- entityType nullable
- entityId nullable
- content
- structuredData
- confidence
- source
- createdAt
- updatedAt
- expiresAt nullable

Types :
- business
- strategic
- experience
- agent

---

## 40. Événements

### DomainEvent

Champs :
- id
- organizationId
- eventType
- aggregateType
- aggregateId
- payload
- occurredAt
- processedAt
- status
- idempotencyKey

Exemples :
- LEAD_CREATED
- QUOTE_ACCEPTED
- JOB_COMPLETED
- INVOICE_OVERDUE
- PAYMENT_RECEIVED
- STOCK_LOW

---

## 41. Notifications

### Notification

Champs :
- id
- organizationId
- userId
- channel
- title
- message
- status
- createdAt
- sentAt
- readAt

Canaux :
- in_app
- push
- email
- sms
- other

---

## 42. Audit

### AuditLog

Champs :
- id
- organizationId
- actorType
- actorId
- action
- resourceType
- resourceId
- previousState
- newState
- metadata
- createdAt

Actor types :
- user
- agent
- system

---

## 43. Relations principales

```text
Organization
├── Users
├── Employees
├── Customers
│   ├── Contacts
│   ├── Sites
│   ├── Opportunities
│   ├── Quotes
│   ├── Contracts
│   ├── Jobs
│   └── Invoices
│
├── Products
├── Suppliers
├── Stock
├── BankTransactions
├── Expenses
├── TaxObligations
├── MarketingCampaigns
├── Tenders
├── Agents
│   └── AgentRuns
│       ├── AgentSteps
│       └── AgentToolCalls
├── Memories
├── Events
├── Notifications
└── AuditLogs

## 44. Données calculées

Les données suivantes ne doivent pas forcément être stockées comme vérité primaire :
- marge actuelle ;
- CA mensuel ;
- panier moyen ;
- taux de conversion ;
- productivité technicien ;
- coût acquisition client ;
- prévision de trésorerie.

Elles sont calculées à partir des données métier.

Des snapshots peuvent être ajoutés plus tard pour les performances et l’historique.

---

## 45. Principes métier

1. Une intervention appartient toujours à une organisation.
2. Une intervention appartient à un client et à un site.
3. Un devis accepté peut générer une intervention ou un contrat.
4. Un contrat peut générer plusieurs interventions.
5. Une intervention peut générer une facture.
6. Une facture peut recevoir plusieurs paiements.
7. Une transaction bancaire peut être rapprochée à un paiement ou une dépense.
8. Les produits consommés alimentent le coût réel de l’intervention.
9. Les temps réels doivent permettre de mesurer la rentabilité.
10. Les agents IA n’écrivent jamais directement en base sans passer par un service métier/tool autorisé.

---

## 46. Objectif analytique

Le modèle doit permettre de répondre à des questions telles que :

- quel client est le plus rentable ?
- quelle prestation a la meilleure marge ?
- combien rapporte chaque technicien ?
- combien coûte réellement une intervention ?
- quels contrats doivent être renégociés ?
- quels clients ont le plus de SAV ?
- quel canal marketing produit le plus de marge ?
- combien de cash est réellement disponible ?
- quelles factures sont en retard ?
- quels produits vont bientôt manquer ?
- quels certificats expirent bientôt ?

---

## 47. Priorité MVP

Toutes les entités ne seront pas implémentées immédiatement.

Ordre MVP :

1. Organization
2. User
3. Customer
4. Contact
5. CustomerSite
6. Lead
7. Service
8. Quote
9. QuoteItem
10. Job
11. JobReport
12. Task
13. Agent
14. AgentRun
15. AgentToolCall
16. AuditLog

Puis :
- contrats ;
- factures ;
- paiements ;
- Qonto ;
- stocks ;
- RH ;
- fiscal ;
- marketing ;
- mémoire avancée.

---

## 48. Règle de cohérence

Avant de créer une nouvelle table, vérifier si :
- l’entité existe déjà ;
- elle mérite réellement une table ;
- elle doit être structurée ou placée dans metadata ;
- elle appartient au domaine métier ou au domaine agentique.

Éviter les tables redondantes et les abstractions prématurées.