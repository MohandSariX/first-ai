First AI — Architecture technique
1. Objectif
First AI est une plateforme web AI-first, multi-agents, destinée à piloter les opérations d’une entreprise depuis une interface principalement conversationnelle.
L’architecture doit être :
- modulaire ;
- testable ;
- observable ;
- sécurisée ;
- évolutive ;
- compatible PWA ;
- compatible avec des agents autonomes ;
- adaptée à un développement progressif avec Codex.
Le système doit éviter les dépendances fortes entre modules.
2. Stack principale
Frontend
- Next.js
- React
- TypeScript
- Tailwind CSS
- shadcn/ui
- TanStack Query
- Zod
Backend
- Node.js
- TypeScript
- Next.js Route Handlers pour les premières APIs
- Worker séparé pour les tâches longues
Base de données
- PostgreSQL
- Supabase
ORM
- Drizzle ORM
Authentification
- Supabase Auth
Stockage fichiers
- Supabase Storage
Queue / jobs
- BullMQ
Redis
- Upstash Redis
IA
- OpenAI Responses API
- OpenAI Agents SDK TypeScript
Vocal
Phase 1 :
- enregistrement audio ;
- transcription ;
- réponse texte.
Phase 2 :
- OpenAI Realtime API ;
- WebRTC ou WebSocket ;
- réponse vocale temps réel.
Déploiement
- Vercel pour l’application web ;
- worker hébergé séparément si nécessaire ;
- Supabase pour PostgreSQL ;
- Upstash pour Redis.
3. Organisation du repository
Le projet doit utiliser un monorepo.
Structure cible :
first-ai/
├── apps/
│   ├── web/
│   └── worker/
│
├── packages/
│   ├── agents/
│   ├── database/
│   ├── tools/
│   ├── schemas/
│   ├── auth/
│   ├── ui/
│   └── shared/
│
├── docs/
│   ├── architecture/
│   ├── agents/
│   ├── tools/
│   └── business-rules/
│
├── tests/
│   ├── integration/
│   ├── e2e/
│   └── evals/
│
├── AGENTS.md
├── ARCHITECTURE.md
├── DATABASE.md
├── DOMAIN.md
├── SECURITY.md
├── TOOLS.md
└── VISION.md
4. Séparation des responsabilités
apps/web
Responsabilités :
- interface utilisateur ;
- PWA ;
- chat ;
- dashboard ;
- CRM ;
- visualisation des données ;
- déclenchement de commandes utilisateur ;
- authentification ;
- affichage des validations humaines.
Ne doit pas contenir :
- logique métier complexe ;
- logique agentique lourde ;
- secrets sensibles ;
- traitements longs.
apps/worker
Responsabilités :
- tâches longues ;
- jobs planifiés ;
- queues ;
- traitements en arrière-plan ;
- agents autonomes ;
- imports volumineux ;
- synchronisations externes ;
- campagnes ;
- évaluations périodiques ;
- génération de rapports.
Le worker consomme les mêmes packages métier que l’application web.
packages/database
Contient :
- schéma Drizzle ;
- migrations ;
- repositories ;
- types DB ;
- helpers transactionnels.
Aucune logique IA ne doit être définie ici.
packages/agents
Contient :
- définitions des agents ;
- instructions systèmes ;
- règles d’autonomie ;
- logique de handoff ;
- orchestration ;
- boucle agentique ;
- model routing ;
- configuration des budgets.
Chaque agent doit être isolé dans son propre module.
packages/tools
Contient tous les outils utilisables par les agents.
Exemples :
- getCustomer
- searchCustomers
- getTodayJobs
- createQuoteDraft
- getBankBalance
- getTransactions
- calculateMargin
- sendEmail
- getInventory
Les agents ne doivent pas accéder directement aux systèmes internes.
packages/schemas
Contient :
- schémas Zod ;
- DTO ;
- contrats d’API ;
- structures communes ;
- schémas de réponses structurées des agents.
packages/auth
Contient :
- rôles ;
- permissions ;
- helpers d’autorisation ;
- contrôle d’accès ;
- policy checks.
packages/ui
Contient les composants visuels réutilisables.
packages/shared
Contient les utilitaires génériques sans logique métier spécifique.
5. Architecture logique
Flux principal :
Utilisateur
   ↓
Web App
   ↓
Director Agent
   ↓
Planner / Orchestrator
   ↓
Specialized Agents
   ↓
Tool Layer
   ↓
Services métier / APIs / Database
   ↓
Résultats
   ↓
Critique / Validation
   ↓
Réponse utilisateur
6. Directeur IA
Le Directeur IA est le point d’entrée principal.
Il doit :
- comprendre l’intention ;
- identifier les domaines concernés ;
- créer un plan ;
- sélectionner les agents nécessaires ;
- sélectionner les outils nécessaires ;
- superviser les appels ;
- vérifier les résultats ;
- demander une validation humaine si nécessaire ;
- synthétiser la réponse finale.
Le Directeur ne doit pas contenir toute la logique métier.
7. Agents spécialisés
Les 18 agents sont définis dans packages/agents.
Structure recommandée :
packages/agents/
├── director/
├── prospecting/
├── qualification/
├── sales/
├── pricing/
├── planning/
├── technician/
├── quality/
├── inventory/
├── cfo/
├── accounting/
├── tax/
├── controlling/
├── collections/
├── marketing/
├── reputation/
├── tenders/
└── hr/
Chaque agent possède :
- id ;
- nom ;
- mission ;
- outils autorisés ;
- outils interdits ;
- modèle recommandé ;
- maxIterations ;
- maxToolCalls ;
- maxCost ;
- autonomyLevel ;
- memoryScopes ;
- guardrails.
8. Contrat standard d’un agent
Exemple conceptuel :
export interface AgentDefinition {
  id: string
  name: string
  mission: string
  allowedTools: string[]
  forbiddenTools: string[]
  autonomyLevel: 0 | 1 | 2 | 3
  maxIterations: number
  maxToolCalls: number
  maxCostUsd: number
  memoryScopes: string[]
}
Les agents doivent être configurés via des définitions explicites et testables.
9. Boucle agentique
La boucle standard est :
OBSERVE
↓
UNDERSTAND
↓
PLAN
↓
ACT
↓
OBSERVE RESULT
↓
CRITIQUE
↓
DECIDE
La décision finale doit être l’une des suivantes :
continue
complete
needs_human
failed
Exemple de structure :
type AgentLoopStatus =
  | "continue"
  | "complete"
  | "needs_human"
  | "failed"

interface AgentLoopDecision {
  status: AgentLoopStatus
  confidence: number
  missingData: string[]
  nextAction?: string
}
10. Limites d’autonomie
Toute exécution possède obligatoirement :
- maxIterations ;
- maxToolCalls ;
- timeout ;
- maxCost ;
- abort signal.
Aucun agent ne peut s’exécuter de manière infinie.
Les valeurs par défaut devront être prudentes.
Exemple :
maxIterations = 8
maxToolCalls = 20
timeout = 120s
Les valeurs pourront varier selon l’agent.
11. Model Router
Tous les agents ne doivent pas utiliser le même modèle.
Le système doit disposer d’un routeur de modèles.
Catégories :
Fast
Pour :
- classification ;
- extraction ;
- résumé ;
- tâches simples.
Standard
Pour :
- qualification ;
- devis ;
- planning ;
- analyse métier.
Reasoning
Pour :
- Directeur IA ;
- analyse financière complexe ;
- stratégie ;
- multi-agent planning ;
- résolution de conflits.
Le choix du modèle doit être configurable.
12. Tool Layer
Les tools constituent l’unique interface entre agents et systèmes métier.
Flux :
Agent
↓
Tool
↓
Authorization
↓
Validation
↓
Service métier
↓
Database / External API
↓
Audit Log
↓
Result
Chaque outil doit :
- valider les entrées ;
- vérifier les permissions ;
- journaliser l’appel ;
- gérer les erreurs ;
- retourner une réponse structurée.
13. Interdiction d’accès direct
Les agents ne doivent jamais :
- exécuter du SQL libre ;
- accéder directement à Qonto ;
- appeler un service externe sans passer par un tool ;
- lire des secrets ;
- exécuter des commandes système arbitraires.
Toute interaction doit passer par des interfaces contrôlées.
14. Event-driven architecture
First AI doit pouvoir réagir à des événements.
Exemples :
LEAD_CREATED
QUOTE_SENT
QUOTE_ACCEPTED
JOB_COMPLETED
JOB_FAILED
CUSTOMER_COMPLAINT
INVOICE_CREATED
INVOICE_OVERDUE
PAYMENT_RECEIVED
BANK_TRANSACTION_RECEIVED
STOCK_LOW
CERTIFICATION_EXPIRING
Chaque événement peut déclencher :
- une tâche ;
- un agent ;
- une notification ;
- une synchronisation ;
- un workflow.
15. Queue system
BullMQ gère les tâches asynchrones.
Queues envisagées :
agent-runs
notifications
emails
bank-sync
document-processing
marketing
follow-ups
scheduled-jobs
evaluations
Chaque job doit :
- être idempotent si possible ;
- avoir un retry policy ;
- être observable ;
- enregistrer ses erreurs.
16. Scheduler
Le worker doit supporter :
- cron jobs ;
- exécutions différées ;
- tâches récurrentes ;
- rappels ;
- contrôles périodiques.
Exemples :
- vérifier les factures en retard chaque matin ;
- vérifier les certifications chaque semaine ;
- générer le rapport financier mensuel ;
- analyser les performances des agents la nuit.
17. Mémoire
La mémoire doit être structurée.
Types :
- business memory ;
- strategic memory ;
- experience memory ;
- agent memory.
Une table mémoire générique pourra contenir :
- type ;
- scope ;
- entityId ;
- content ;
- confidence ;
- source ;
- createdAt ;
- expiresAt.
Les informations critiques doivent rester dans les tables métier structurées.
La mémoire ne remplace jamais la base métier.
18. Knowledge Base
La base documentaire doit pouvoir indexer :
- procédures ;
- contrats ;
- guides ;
- FDS ;
- réglementations ;
- documentations ;
- conditions commerciales ;
- documents internes.
Le moteur pourra utiliser :
- PostgreSQL + pgvector ;
  ou
- un service de file search externe.
Le choix définitif pourra être pris lors de la phase Knowledge Base.
19. Observabilité agentique
Chaque agent run doit enregistrer :
- runId ;
- agentId ;
- userId ;
- organizationId ;
- objective ;
- startedAt ;
- completedAt ;
- status ;
- model ;
- token usage ;
- cost ;
- tool calls ;
- errors ;
- output ;
- approval requests.
Les traces doivent être consultables dans l’interface admin.
20. Audit logs
Toute action importante doit générer un audit log.
Champs :
- actorType ;
- actorId ;
- action ;
- resourceType ;
- resourceId ;
- previousState ;
- newState ;
- timestamp ;
- metadata.
actorType peut être :
- user ;
- agent ;
- system.
21. Human-in-the-loop
Les actions sensibles passent par une table :
approval_requests
Exemples :
- virement ;
- remboursement ;
- remise importante ;
- contrat ;
- embauche ;
- licenciement ;
- achat important ;
- changement fiscal.
Statuts :
pending
approved
rejected
expired
22. API externe
Les intégrations externes doivent être encapsulées dans des adapters.
Exemples :
integrations/qonto
integrations/openai
integrations/email
integrations/maps
integrations/accounting
Chaque intégration doit avoir :
- interface ;
- implementation ;
- mock pour tests.
23. Qonto
Première version :
- lecture seule ;
- récupération soldes ;
- récupération transactions ;
- rapprochement avec factures.
Aucune fonction d’émission de virement au départ.
24. Email
Prévoir une abstraction :
interface EmailProvider {
  send(...)
  getMessages(...)
  getThread(...)
}
Cela permettra de changer de fournisseur sans réécrire les agents.
25. PWA
La webapp doit être :
- responsive ;
- installable ;
- mobile-first ;
- utilisable au doigt ;
- adaptée au mode terrain.
Fonctions futures possibles :
- notifications push ;
- cache partiel ;
- capture photo ;
- microphone ;
- partage système.
26. Vocal
Architecture Phase 1 :
Microphone
↓
Audio blob
↓
Transcription
↓
Director Agent
↓
Response
↓
Optional TTS
Architecture Phase 2 :
WebRTC
↓
Realtime API
↓
Director
↓
Tools / Agents
↓
Audio response
27. Sécurité réseau
Toutes les communications externes doivent utiliser HTTPS.
Les appels backend sensibles doivent être exécutés côté serveur.
Aucune clé API secrète ne doit être exposée au frontend.
28. Secrets
Secrets interdits dans Git.
Exemples :
OPENAI_API_KEY
SUPABASE_SERVICE_ROLE_KEY
QONTO_API_KEY
REDIS_URL
Utiliser :
- variables d’environnement ;
- secret manager du fournisseur ;
- .env.local uniquement en développement.
29. Environnements
Prévoir au minimum :
development
staging
production
Les bases, secrets et intégrations doivent être séparés.
30. Tests
Unit tests
Pour :
- services ;
- pricing ;
- calculations ;
- permissions ;
- utilities.
Integration tests
Pour :
- repositories ;
- DB ;
- tools ;
- external adapters mockés.
E2E tests
Avec Playwright.
Agent evals
Pour vérifier :
- choix d’outil ;
- respect des permissions ;
- qualité des réponses ;
- arrêt correct ;
- non-exécution d’actions sensibles.
31. CI/CD
Chaque pull request doit pouvoir exécuter :
lint
typecheck
unit tests
integration tests
build
Les migrations doivent être vérifiées.
Les déploiements production doivent être traçables.
32. Idempotence
Les jobs asynchrones et événements doivent être conçus pour éviter les doubles exécutions.
Exemple :
un paiement reçu ne doit jamais générer deux rapprochements.
Utiliser :
- idempotency keys ;
- unique constraints ;
- job IDs stables.
33. Gestion des erreurs
Toute erreur importante doit avoir :
- code ;
- message utilisateur ;
- message technique ;
- contexte ;
- correlationId.
Les agents ne doivent pas masquer les erreurs système.
34. Feature flags
Prévoir un mécanisme simple de feature flags.
Exemples :
- voiceEnabled ;
- autonomousCollectionsEnabled ;
- qontoSyncEnabled ;
- marketingAgentEnabled.
Cela permet d’activer les agents progressivement.
35. Versioning
Chaque agent doit avoir une version.
Exemple :
pricing-agent:v1
pricing-agent:v2
Chaque run enregistre la version utilisée.
Cela permet de comparer les performances.
36. Backward compatibility
Les outils et événements doivent être versionnés lorsqu’ils deviennent critiques.
Exemple :
quote.created.v1
quote.created.v2
37. Principes d’architecture
1. Les agents ne sont pas la source de vérité.
2. PostgreSQL est la source de vérité métier.
3. Toute action passe par un tool.
4. Toute action importante est auditée.
5. Toute action sensible peut être bloquée.
6. Aucun agent ne dispose de privilèges inutiles.
7. Les modèles IA sont interchangeables.
8. Les intégrations externes sont encapsulées.
9. Les tâches longues sont exécutées par le worker.
10. La complexité agentique reste indépendante de l’interface utilisateur.
38. Priorité MVP
Le MVP ne doit pas implémenter toute l’architecture immédiatement.
Ordre :
1. fondations web ;
2. auth ;
3. database ;
4. CRM minimal ;
5. chat ;
6. Directeur IA ;
7. premiers tools ;
8. quelques agents ;
9. vocal ;
10. Qonto ;
11. automation ;
12. mémoire ;
13. agents restants.
39. Règle de développement
Aucune nouvelle fonctionnalité ne doit être développée avant de savoir :
- dans quel module elle appartient ;
- quelles données elle utilise ;
- quels rôles y accèdent ;
- quels tools l’exposent ;
- quels tests sont nécessaires ;
- quelles actions sont auditées.
40. Objectif architectural final
First AI doit pouvoir évoluer d’un assistant conversationnel métier vers une plateforme autonome supervisée sans réécriture majeure.
L’architecture doit permettre d’ajouter :
- agents ;
- tools ;
- intégrations ;
- workflows ;
- événements ;
- modèles ;
- nouveaux domaines métier ;
sans casser les modules existants.