# First AI — Database Model

## 1. Objectif

Ce document définit l’architecture de données de First AI.

La base principale est PostgreSQL.

Supabase est utilisé pour :
- PostgreSQL ;
- Auth ;
- Storage ;
- Row Level Security ;
- éventuellement Realtime.

Drizzle ORM est utilisé comme couche d’accès typée à PostgreSQL.

La base de données constitue la source de vérité principale pour les données métier structurées.

Les agents IA ne doivent jamais accéder directement à PostgreSQL.

Les agents utilisent uniquement les tools définis dans `TOOLS.md`.

---

# 2. Principes généraux

La base doit respecter les principes suivants :

1. toutes les données métier sont rattachées à une organisation ;
2. les clés primaires utilisent des UUID ;
3. les dates utilisent des timestamps UTC ;
4. les montants monétaires sont stockés de manière précise ;
5. les suppressions critiques utilisent principalement le soft delete ;
6. les relations importantes utilisent des foreign keys ;
7. les contraintes métier importantes doivent être garanties par PostgreSQL lorsque possible ;
8. les indexes doivent être ajoutés selon les usages réels ;
9. les événements métier doivent être traçables ;
10. les données agentiques ne remplacent jamais les données métier.

---

# 3. Conventions

## Identifiants

Utiliser :

```sql
uuid
```

Exemple :

```text
id UUID PRIMARY KEY
```

Les UUID sont générés côté application ou PostgreSQL.

---

## Dates

Utiliser :

```sql
TIMESTAMPTZ
```

pour les dates et heures.

Les données sont stockées en UTC.

L’affichage utilise le fuseau horaire de l’organisation.

---

## Montants

Ne jamais utiliser :

```text
float
double
```

pour les montants financiers.

Utiliser :

```sql
NUMERIC(14,2)
```

ou plus précis si nécessaire.

Exemple :

```text
amount NUMERIC(14,2)
```

---

## Pourcentages

Utiliser par exemple :

```sql
NUMERIC(6,3)
```

selon le besoin.

Exemple :

```text
tax_rate
margin_rate
probability
```

---

## Statuts

Les statuts doivent être :
- enum PostgreSQL lorsque très stables ;
ou
- varchar contrôlé par validation applicative lorsqu’ils risquent d’évoluer souvent.

Le choix sera fait table par table.

---

## JSON

Utiliser :

```sql
JSONB
```

uniquement lorsque les données sont :
- semi-structurées ;
- variables ;
- secondaires ;
- externes.

Ne pas utiliser JSONB pour éviter de modéliser correctement une donnée métier importante.

---

# 4. Multi-tenant

First AI doit être compatible multi-organisation dès le départ.

La majorité des tables métier doivent contenir :

```text
organization_id
```

Référence :

```text
organizations.id
```

Les requêtes doivent être filtrées par organisation.

---

# 5. Table organizations

```text
organizations
```

Colonnes :

```text
id
name
legal_name
siret
vat_number
email
phone

address_line1
address_line2
postal_code
city
country

timezone
currency

status

created_at
updated_at
deleted_at
```

Contraintes :

```text
id PRIMARY KEY
```

Valeurs par défaut :

```text
timezone = Europe/Paris
currency = EUR
status = active
```

---

# 6. Table users

```text
users
```

Représente les utilisateurs applicatifs First AI.

Colonnes :

```text
id
organization_id
auth_user_id

first_name
last_name
email
phone

role
status

last_login_at

created_at
updated_at
deleted_at
```

Relations :

```text
organization_id -> organizations.id
```

```text
auth_user_id -> Supabase Auth user ID
```

Index :

```text
organization_id
auth_user_id UNIQUE
email
```

---

# 7. Rôles utilisateurs

Valeurs initiales :

```text
OWNER
ADMIN
MANAGER
TECHNICIAN
ACCOUNTANT
READ_ONLY
```

Les rôles ne doivent pas suffire seuls à déterminer les droits.

Un système de permissions peut être ajouté.

---

# 8. Table employees

```text
employees
```

Colonnes :

```text
id
organization_id
user_id

first_name
last_name
email
phone

employee_type
status

hire_date
end_date

hourly_cost

notes

created_at
updated_at
deleted_at
```

Valeurs `employee_type` :

```text
employee
contractor
owner
```

Valeurs status :

```text
active
inactive
suspended
```

Relations :

```text
organization_id -> organizations.id
user_id -> users.id nullable
```

---

# 9. Table certifications

```text
certifications
```

Colonnes :

```text
id
organization_id
employee_id

type
name
certificate_number

issued_at
expires_at

document_id

status

created_at
updated_at
```

Relations :

```text
employee_id -> employees.id
document_id -> documents.id nullable
```

Indexes :

```text
employee_id
expires_at
status
```

---

# 10. Table leads

```text
leads
```

Colonnes :

```text
id
organization_id

source
type

company_name

first_name
last_name

email
phone

address_line1
address_line2
postal_code
city
country

status
score

assigned_user_id

estimated_value

notes

created_at
updated_at
converted_at
deleted_at
```

Relations :

```text
assigned_user_id -> users.id
```

Indexes :

```text
organization_id
status
score
created_at
assigned_user_id
email
phone
```

---

# 11. Lead status

Valeurs :

```text
new
contacted
qualified
proposal
won
lost
archived
```

---

# 12. Lead sources

Valeurs :

```text
website
phone
google_ads
referral
outbound
tender
manual
other
```

---

# 13. Table opportunities

```text
opportunities
```

Colonnes :

```text
id
organization_id

lead_id
customer_id

name
stage

probability

estimated_amount
expected_close_date

assigned_user_id

lost_reason

notes

created_at
updated_at
closed_at
deleted_at
```

Relations :

```text
lead_id -> leads.id nullable
customer_id -> customers.id nullable
assigned_user_id -> users.id nullable
```

---

# 14. Opportunity stages

Valeurs :

```text
qualification
discovery
quote
negotiation
won
lost
```

---

# 15. Table customers

```text
customers
```

Colonnes :

```text
id
organization_id

type

name
legal_name

siret
vat_number

billing_email
phone

payment_terms_days

status
risk_level

notes

created_at
updated_at
deleted_at
```

Indexes :

```text
organization_id
name
siret
status
type
```

---

# 16. Customer types

Valeurs initiales :

```text
individual
company
property_manager
restaurant
hotel
retail
public
other
```

---

# 17. Customer status

Valeurs :

```text
active
inactive
blocked
prospect
```

---

# 18. Customer risk level

Valeurs :

```text
low
normal
high
critical
```

---

# 19. Table contacts

```text
contacts
```

Colonnes :

```text
id
organization_id
customer_id

first_name
last_name
role

email
phone

is_primary

notes

created_at
updated_at
deleted_at
```

Relations :

```text
customer_id -> customers.id
```

Indexes :

```text
customer_id
email
phone
```

---

# 20. Table customer_sites

```text
customer_sites
```

Colonnes :

```text
id
organization_id
customer_id

name

address_line1
address_line2
postal_code
city
country

latitude
longitude

access_instructions
access_hours

primary_contact_id

notes

created_at
updated_at
deleted_at
```

Relations :

```text
customer_id -> customers.id
primary_contact_id -> contacts.id nullable
```

Indexes :

```text
customer_id
postal_code
city
```

---

# 21. Table pest_types

Référentiel global ou organisationnel.

```text
pest_types
```

Colonnes :

```text
id
code
name
category
active

created_at
updated_at
```

Exemples :

```text
rat
mouse
cockroach
bed_bug
ant
fly
wasp
moth
flea
other
```

---

# 22. Table services

```text
services
```

Colonnes :

```text
id
organization_id

code
name
category
description

pricing_mode

base_price
estimated_duration_minutes

active

created_at
updated_at
deleted_at
```

Indexes :

```text
organization_id
code
category
active
```

Unique :

```text
organization_id + code
```

---

# 23. Pricing modes

Valeurs :

```text
fixed
hourly
unit
custom
subscription
```

---

# 24. Table suppliers

```text
suppliers
```

Colonnes :

```text
id
organization_id

name

contact_name
email
phone
website

payment_terms_days

notes

created_at
updated_at
deleted_at
```

---

# 25. Table products

```text
products
```

Colonnes :

```text
id
organization_id

sku
name
category

supplier_id

purchase_price

unit
minimum_stock

active

regulatory_data JSONB

notes

created_at
updated_at
deleted_at
```

Relations :

```text
supplier_id -> suppliers.id nullable
```

Unique :

```text
organization_id + sku
```

---

# 26. Table stock_locations

```text
stock_locations
```

Colonnes :

```text
id
organization_id

name
type

employee_id nullable

created_at
updated_at
deleted_at
```

Types :

```text
warehouse
vehicle
office
other
```

---

# 27. Table stock_movements

```text
stock_movements
```

Colonnes :

```text
id
organization_id

product_id
stock_location_id

type
quantity
unit_cost

job_id
supplier_id

created_by_user_id
created_by_agent_id

created_at

metadata JSONB
```

Relations :

```text
product_id -> products.id
stock_location_id -> stock_locations.id
job_id -> jobs.id nullable
supplier_id -> suppliers.id nullable
```

Types :

```text
purchase
consumption
transfer_in
transfer_out
adjustment
return
waste
```

---

# 28. Calcul du stock

Le stock courant doit être calculable depuis les mouvements.

À terme, une table ou vue matérialisée peut maintenir les quantités disponibles pour améliorer les performances.

Ne pas perdre la traçabilité des mouvements.

---

# 29. Table quotes

```text
quotes
```

Colonnes :

```text
id
organization_id

customer_id
site_id
opportunity_id

quote_number

status

subtotal
tax_amount
total

estimated_cost
estimated_margin
estimated_margin_rate

valid_until

sent_at
viewed_at
accepted_at
rejected_at

created_by_user_id
created_by_agent_id

notes

created_at
updated_at
deleted_at
```

Relations :

```text
customer_id -> customers.id
site_id -> customer_sites.id
opportunity_id -> opportunities.id nullable
```

Unique :

```text
organization_id + quote_number
```

---

# 30. Quote status

Valeurs :

```text
draft
ready
sent
viewed
accepted
rejected
expired
cancelled
```

---

# 31. Table quote_items

```text
quote_items
```

Colonnes :

```text
id
quote_id

service_id

description

quantity
unit_price
tax_rate

cost_estimate

sort_order

created_at
updated_at
```

Relations :

```text
quote_id -> quotes.id
service_id -> services.id nullable
```

---

# 32. Table contracts

```text
contracts
```

Colonnes :

```text
id
organization_id

customer_id
site_id

name

status

start_date
end_date

billing_frequency
billing_amount

visit_frequency

auto_renew
notice_period_days

signed_document_id

notes

created_at
updated_at
terminated_at
deleted_at
```

Relations :

```text
customer_id -> customers.id
site_id -> customer_sites.id nullable
signed_document_id -> documents.id nullable
```

---

# 33. Contract statuses

```text
draft
active
suspended
terminated
expired
```

---

# 34. Billing frequency

Valeurs initiales :

```text
once
weekly
monthly
quarterly
semiannual
annual
custom
```

---

# 35. Table jobs

```text
jobs
```

Colonnes :

```text
id
organization_id

customer_id
site_id

contract_id
quote_id
service_id
pest_type_id

infestation_level

status
priority

scheduled_start
scheduled_end

actual_start
actual_end

assigned_employee_id

price

estimated_cost
actual_cost

estimated_margin
actual_margin

description

internal_notes
customer_notes

created_by_user_id
created_by_agent_id

created_at
updated_at
deleted_at
```

Relations :

```text
customer_id -> customers.id
site_id -> customer_sites.id
contract_id -> contracts.id nullable
quote_id -> quotes.id nullable
service_id -> services.id
pest_type_id -> pest_types.id nullable
assigned_employee_id -> employees.id nullable
```

Indexes :

```text
organization_id
scheduled_start
status
assigned_employee_id
customer_id
site_id
```

---

# 36. Job statuses

Valeurs :

```text
draft
scheduled
confirmed
en_route
in_progress
completed
follow_up_required
cancelled
failed
```

---

# 37. Job priorities

Valeurs :

```text
low
normal
high
urgent
```

---

# 38. Infestation levels

Valeurs :

```text
unknown
low
medium
high
critical
```

---

# 39. Table job_reports

```text
job_reports
```

Colonnes :

```text
id
organization_id
job_id

technician_id

observations

infestation_level_before
infestation_level_after

treatment_performed

products_used_summary

recommendations

follow_up_required
follow_up_date

customer_signature_document_id

completed_at

created_at
updated_at
```

Relations :

```text
job_id -> jobs.id
technician_id -> employees.id
customer_signature_document_id -> documents.id nullable
```

---

# 40. Table job_product_usage

```text
job_product_usage
```

Colonnes :

```text
id
organization_id

job_id
product_id

quantity
unit_cost

total_cost

created_at
```

Relations :

```text
job_id -> jobs.id
product_id -> products.id
```

---

# 41. Table documents

```text
documents
```

Colonnes :

```text
id
organization_id

type

storage_provider
storage_path

filename
mime_type
size_bytes

uploaded_by_user_id
uploaded_by_agent_id

checksum

metadata JSONB

created_at
updated_at
deleted_at
```

Indexes :

```text
organization_id
type
created_at
```

---

# 42. Document types

Valeurs initiales :

```text
photo
invoice
quote
contract
certification
supplier_invoice
safety_document
identity_document
other
```

---

# 43. Pièces jointes génériques

Pour permettre d’attacher plusieurs documents à différentes entités, prévoir :

```text
document_links
```

Colonnes :

```text
id
organization_id

document_id

entity_type
entity_id

created_at
```

Exemples `entity_type` :

```text
customer
job
quote
invoice
contract
employee
supplier
```

---

# 44. Table invoices

```text
invoices
```

Colonnes :

```text
id
organization_id

customer_id

contract_id
job_id
quote_id

invoice_number

status

issue_date
due_date

subtotal
tax_amount
total

amount_paid
amount_due

sent_at
paid_at

accounting_reference

created_by_user_id
created_by_agent_id

notes

created_at
updated_at
deleted_at
```

Unique :

```text
organization_id + invoice_number
```

Indexes :

```text
customer_id
status
due_date
issue_date
```

---

# 45. Invoice statuses

```text
draft
issued
sent
partially_paid
paid
overdue
cancelled
written_off
```

---

# 46. Table invoice_items

Prévoir une table dédiée :

```text
invoice_items
```

Colonnes :

```text
id
invoice_id

service_id

description

quantity
unit_price
tax_rate

subtotal
tax_amount
total

sort_order
```

---

# 47. Table payments

```text
payments
```

Colonnes :

```text
id
organization_id

invoice_id
customer_id
bank_transaction_id

amount

method
status

paid_at

reference

created_at
updated_at
```

Relations :

```text
invoice_id -> invoices.id nullable
customer_id -> customers.id
bank_transaction_id -> bank_transactions.id nullable
```

---

# 48. Payment methods

```text
card
bank_transfer
cash
direct_debit
cheque
other
```

---

# 49. Table bank_accounts

```text
bank_accounts
```

Colonnes :

```text
id
organization_id

provider
external_id

name
iban_masked

currency

status

last_synced_at

metadata JSONB

created_at
updated_at
```

Qonto est le premier provider envisagé.

---

# 50. Table bank_transactions

```text
bank_transactions
```

Colonnes :

```text
id
organization_id

bank_account_id

external_id
provider

type

amount
currency

label
counterparty_name

transaction_date
value_date

status

raw_data JSONB

imported_at
created_at
updated_at
```

Unique :

```text
provider + external_id
```

Indexes :

```text
organization_id
bank_account_id
transaction_date
amount
```

---

# 51. Table expenses

```text
expenses
```

Colonnes :

```text
id
organization_id

supplier_id
bank_transaction_id
document_id

category

amount_excl_tax
tax_amount
total_amount

expense_date

status

accounting_category

notes

created_at
updated_at
deleted_at
```

---

# 52. Expense statuses

```text
draft
categorized
validated
exported
cancelled
```

---

# 53. Table tax_obligations

```text
tax_obligations
```

Colonnes :

```text
id
organization_id

type
period

estimated_amount
actual_amount

due_date

status

document_id

source

notes

created_at
updated_at
```

Types :

```text
VAT
CORPORATE_TAX
CFE
URSSAF
PAYROLL
OTHER
```

---

# 54. Tax obligation statuses

```text
estimated
pending
ready
declared
paid
overdue
cancelled
```

---

# 55. Table tasks

```text
tasks
```

Colonnes :

```text
id
organization_id

title
description

status
priority

assigned_user_id
assigned_agent_id

due_at

source_type
source_id

created_by_type
created_by_id

created_at
updated_at
completed_at
deleted_at
```

---

# 56. Task statuses

```text
todo
in_progress
blocked
completed
cancelled
```

---

# 57. Task priorities

```text
low
normal
high
urgent
```

---

# 58. Table alerts

```text
alerts
```

Colonnes :

```text
id
organization_id

type
severity

title
message

entity_type
entity_id

status

created_at
resolved_at
resolved_by_user_id
```

---

# 59. Alert severity

```text
info
warning
critical
```

---

# 60. Alert statuses

```text
open
acknowledged
resolved
dismissed
```

---

# 61. Table customer_reviews

```text
customer_reviews
```

Colonnes :

```text
id
organization_id

customer_id
job_id

platform

rating
comment

review_url

requested_at
received_at

status

created_at
updated_at
```

---

# 62. Table marketing_campaigns

```text
marketing_campaigns
```

Colonnes :

```text
id
organization_id

name
channel

status

budget
spend

leads_generated
customers_generated

revenue_attributed
margin_attributed

start_date
end_date

external_campaign_id

metadata JSONB

created_at
updated_at
```

---

# 63. Marketing channels

```text
google_ads
seo
email
outbound
referral
social
other
```

---

# 64. Table tenders

```text
tenders
```

Colonnes :

```text
id
organization_id

source

title
buyer

estimated_value
deadline

status

url

fit_score
estimated_margin

notes

metadata JSONB

created_at
updated_at
```

---

# 65. Tender statuses

```text
discovered
analyzing
relevant
preparing
submitted
won
lost
ignored
```

---

# 66. Table agents

```text
agents
```

Colonnes :

```text
id

organization_id nullable

code
name
version

status

autonomy_level

model_profile

configuration JSONB

created_at
updated_at
```

Unique recommandé :

```text
organization_id + code + version
```

Pour agents globaux :

```text
organization_id nullable
```

---

# 67. Agent status

```text
draft
active
disabled
deprecated
```

---

# 68. Table agent_runs

```text
agent_runs
```

Colonnes :

```text
id
organization_id

agent_id

parent_run_id

triggered_by_type
triggered_by_id

objective

status

started_at
completed_at

iteration_count
tool_call_count

input_tokens
output_tokens

estimated_cost

final_output JSONB

error_code
error_message

correlation_id

created_at
```

Relations :

```text
agent_id -> agents.id
parent_run_id -> agent_runs.id nullable
```

Indexes :

```text
organization_id
agent_id
status
started_at
parent_run_id
correlation_id
```

---

# 69. Agent run statuses

```text
queued
running
waiting_approval
completed
failed
cancelled
timeout
budget_exceeded
```

---

# 70. Table agent_steps

```text
agent_steps
```

Colonnes :

```text
id
agent_run_id

sequence

type

input JSONB
output JSONB

status

started_at
completed_at

created_at
```

Relations :

```text
agent_run_id -> agent_runs.id
```

---

# 71. Agent step types

```text
observation
planning
tool_call
delegation
critique
decision
final
```

---

# 72. Table agent_tool_calls

```text
agent_tool_calls
```

Colonnes :

```text
id
organization_id

agent_run_id
agent_id

tool_name

risk_level

input JSONB
output JSONB

status

started_at
completed_at

error_code
error_message

approval_required
approval_request_id

idempotency_key

created_at
```

Indexes :

```text
agent_run_id
agent_id
tool_name
status
```

---

# 73. Tool call statuses

```text
pending
running
completed
failed
blocked
waiting_approval
cancelled
```

---

# 74. Table approval_requests

```text
approval_requests
```

Colonnes :

```text
id
organization_id

type

requested_by_agent_id
requested_by_user_id

resource_type
resource_id

description

proposed_action JSONB

risk_level

status

requested_at
expires_at

resolved_at
resolved_by_user_id

resolution_comment

created_at
updated_at
```

---

# 75. Approval statuses

```text
pending
approved
rejected
expired
cancelled
```

---

# 76. Table memories

```text
memories
```

Colonnes :

```text
id
organization_id

type
scope

entity_type
entity_id

content

structured_data JSONB

confidence

source_type
source_id

status

created_at
updated_at
expires_at
invalidated_at
```

Types :

```text
business
strategic
experience
agent
```

Statuses :

```text
candidate
active
invalidated
expired
```

---

# 77. Mémoire et vérité métier

Une mémoire ne doit jamais remplacer une valeur structurée existante.

Exemple incorrect :

```text
memory:
"Le client Dupont doit 3 000 €"
```

si cette information existe déjà dans `invoices`.

La mémoire est utilisée pour les informations contextuelles et apprises.

---

# 78. Table domain_events

```text
domain_events
```

Colonnes :

```text
id
organization_id

event_type

aggregate_type
aggregate_id

payload JSONB

occurred_at

status

processing_attempts

processed_at

idempotency_key

created_at
```

Unique :

```text
idempotency_key
```

Indexes :

```text
organization_id
event_type
status
occurred_at
```

---

# 79. Domain event statuses

```text
pending
processing
processed
failed
dead_letter
```

---

# 80. Table notifications

```text
notifications
```

Colonnes :

```text
id
organization_id

user_id

channel

title
message

status

metadata JSONB

created_at
sent_at
read_at
```

---

# 81. Notification channels

```text
in_app
push
email
sms
other
```

---

# 82. Notification statuses

```text
pending
sent
failed
read
cancelled
```

---

# 83. Table audit_logs

```text
audit_logs
```

Colonnes :

```text
id
organization_id

actor_type
actor_id

action

resource_type
resource_id

previous_state JSONB
new_state JSONB

metadata JSONB

correlation_id

created_at
```

Actor types :

```text
user
agent
system
integration
```

Les audit logs ne doivent pas être modifiés après création sauf nécessité exceptionnelle.

---

# 84. Table integration_connections

Prévoir les intégrations externes.

```text
integration_connections
```

Colonnes :

```text
id
organization_id

provider
name

status

external_account_id

configuration JSONB

secret_reference

connected_at
last_synced_at

created_at
updated_at
deleted_at
```

Le secret ne doit pas être stocké directement dans `configuration`.

`secret_reference` pointe vers un secret manager.

---

# 85. Providers initiaux

Valeurs envisageables :

```text
qonto
openai
email
google_calendar
maps
accounting
other
```

---

# 86. Table sync_runs

Pour tracer les synchronisations externes.

```text
sync_runs
```

Colonnes :

```text
id
organization_id

integration_connection_id

type

status

started_at
completed_at

records_received
records_created
records_updated
records_failed

cursor

error_message

metadata JSONB
```

---

# 87. Table feature_flags

```text
feature_flags
```

Colonnes :

```text
id
organization_id nullable

key

enabled

configuration JSONB

created_at
updated_at
```

Exemples :

```text
voice_enabled
qonto_sync_enabled
autonomous_collections_enabled
autonomous_scheduling_enabled
marketing_agent_enabled
```

---

# 88. Table organization_settings

```text
organization_settings
```

Colonnes :

```text
id
organization_id

key
value JSONB

created_at
updated_at
```

Unique :

```text
organization_id + key
```

Exemples :

```text
minimum_cash_reserve
default_margin_target
quote_approval_threshold
supplier_order_approval_threshold
max_autonomous_discount
```

---

# 89. Table agent_configs

Si la configuration des agents devient importante, séparer :

```text
agent_configs
```

Colonnes :

```text
id
organization_id
agent_id

enabled

autonomy_level

max_iterations
max_tool_calls
max_delegations
max_cost

model_profile

settings JSONB

created_at
updated_at
```

---

# 90. Table conversations

Le chat First AI nécessite un historique structuré.

```text
conversations
```

Colonnes :

```text
id
organization_id

created_by_user_id

title

status

created_at
updated_at
archived_at
```

---

# 91. Table conversation_messages

```text
conversation_messages
```

Colonnes :

```text
id
organization_id

conversation_id

role

content

content_type

agent_run_id

metadata JSONB

created_at
```

Roles :

```text
user
assistant
system
tool
```

Content types :

```text
text
audio
image
document
structured
```

---

# 92. Audio

Ne pas stocker systématiquement tous les fichiers audio indéfiniment.

Prévoir :
- politique de rétention ;
- suppression ;
- stockage uniquement si nécessaire ;
- transcription persistée si utile.

Les fichiers audio peuvent être stockés via `documents`.

---

# 93. Table pricing_rules

Le pricing devra devenir configurable.

```text
pricing_rules
```

Colonnes :

```text
id
organization_id

name
service_id
pest_type_id

priority

conditions JSONB
formula JSONB

active

valid_from
valid_until

created_at
updated_at
```

Exemple :

```text
service = cockroach_treatment
surface > 100m²
coefficient = 1.4
```

---

# 94. Table pricing_history

Permettre l’apprentissage sur le pricing.

```text
pricing_history
```

Colonnes :

```text
id
organization_id

quote_id
job_id

service_id

recommended_price
minimum_price
final_price

estimated_cost
actual_cost

estimated_margin
actual_margin

accepted

pricing_model_version

created_at
```

Cette table sera particulièrement utile pour l’Agent Pricing.

---

# 95. Table customer_interactions

Historique commercial général.

```text
customer_interactions
```

Colonnes :

```text
id
organization_id

customer_id
lead_id
contact_id

channel
direction

type

subject
summary

occurred_at

created_by_user_id
created_by_agent_id

metadata JSONB

created_at
```

Channels :

```text
phone
email
sms
whatsapp
in_person
web
other
```

---

# 96. Table complaints

```text
complaints
```

Colonnes :

```text
id
organization_id

customer_id
job_id

severity

status

description

root_cause

resolution

created_at
resolved_at

created_by_user_id
```

---

# 97. Complaint statuses

```text
open
investigating
action_required
resolved
closed
```

---

# 98. Table absences

```text
employee_absences
```

Colonnes :

```text
id
organization_id

employee_id

type

start_at
end_at

status

notes

created_at
updated_at
```

---

# 99. Table working_time_entries

Pour suivre les temps réels.

```text
working_time_entries
```

Colonnes :

```text
id
organization_id

employee_id
job_id

type

started_at
ended_at

duration_minutes

source

created_at
updated_at
```

Types :

```text
job
travel
admin
training
other
```

Cette donnée sera essentielle pour calculer la vraie productivité.

---

# 100. Table travel_entries

Optionnelle si le détail déplacement devient important.

```text
travel_entries
```

Colonnes :

```text
id
organization_id

employee_id
job_id

origin_site_id
destination_site_id

distance_km
duration_minutes

estimated
actual

created_at
```

---

# 101. Table vehicle

À prévoir lorsque l’activité grandira.

```text
vehicles
```

Colonnes :

```text
id
organization_id

registration
brand
model

status

assigned_employee_id

purchase_date

monthly_cost
cost_per_km

notes

created_at
updated_at
deleted_at
```

---

# 102. Historique des modifications

Pour certaines entités importantes, les audit logs suffisent.

Ne pas créer automatiquement :

```text
customer_history
quote_history
job_history
```

si `audit_logs` couvre déjà le besoin.

Créer des tables historiques dédiées uniquement si un besoin analytique réel apparaît.

---

# 103. Soft delete

Tables candidates :

```text
customers
contacts
customer_sites
employees
products
suppliers
services
users
```

Champ :

```text
deleted_at
```

Les lignes ne sont pas supprimées immédiatement.

---

# 104. Suppression physique

Réservée notamment :
- obligations légales ;
- RGPD ;
- données temporaires ;
- nettoyage contrôlé.

Elle doit être explicitement implémentée.

---

# 105. Numérotation documents

Les numéros :
- devis ;
- factures ;

doivent être gérés côté serveur.

Exemple :

```text
DEV-2027-000001
FAC-2027-000001
```

La logique doit éviter les collisions.

Pour les factures, respecter les exigences comptables et fiscales applicables lors de l’implémentation.

---

# 106. Séquences métier

Une table peut être utilisée :

```text
business_sequences
```

Colonnes :

```text
id
organization_id

type
year

current_value

updated_at
```

Unique :

```text
organization_id + type + year
```

---

# 107. Constraints importantes

Exemples :

```text
invoice.total >= 0
quote.total >= 0
payment.amount > 0
stock_movement.quantity != 0
```

Une probabilité doit être comprise entre :

```text
0 et 100
```

Une confidence IA doit être comprise entre :

```text
0 et 1
```

---

# 108. Foreign keys

Les foreign keys importantes doivent être réelles.

Éviter des relations uniquement applicatives lorsque PostgreSQL peut les garantir.

---

# 109. Cascade delete

Utiliser avec prudence.

Éviter les cascades destructives sur :
- clients ;
- factures ;
- jobs ;
- paiements ;
- audit logs.

Pour les enfants strictement dépendants comme `quote_items`, une cascade peut être acceptable.

---

# 110. Indexes

Indexes initiaux recommandés :

```text
organization_id
created_at
status
```

selon les tables.

Indexes spécifiques :

```text
jobs.scheduled_start
jobs.assigned_employee_id

invoices.due_date
invoices.status

leads.status
leads.score

agent_runs.started_at
agent_runs.status

domain_events.status
domain_events.event_type

bank_transactions.transaction_date
```

---

# 111. Indexes composites

Exemples :

```text
jobs(
  organization_id,
  scheduled_start
)
```

```text
invoices(
  organization_id,
  status,
  due_date
)
```

```text
leads(
  organization_id,
  status,
  created_at
)
```

---

# 112. Full text search

Les recherches initiales peuvent utiliser PostgreSQL.

À terme :
- full text search ;
- trigram indexes ;
- recherche vectorielle.

Exemples :
- clients ;
- documents ;
- notes ;
- knowledge base.

---

# 113. Vector search

Supabase/PostgreSQL peut utiliser :

```text
pgvector
```

pour :
- knowledge base ;
- mémoire ;
- recherche documentaire.

Ne pas vectoriser inutilement toutes les données métier.

---

# 114. Embeddings

Table possible :

```text
knowledge_chunks
```

Colonnes :

```text
id
organization_id

document_id

chunk_index

content

embedding

metadata JSONB

created_at
```

---

# 115. Table knowledge_documents

```text
knowledge_documents
```

Colonnes :

```text
id
organization_id

title
type

document_id

status

source

version

created_at
updated_at
```

---

# 116. Provenance Knowledge

Chaque chunk doit pouvoir être relié à :
- document ;
- version ;
- page ;
- section ;
- source.

First AI doit pouvoir expliquer d’où vient une information importante.

---

# 117. Tables agrégées

Ne pas créer trop tôt.

Exemples futurs :

```text
daily_financial_metrics
customer_profitability_snapshots
service_performance_snapshots
agent_performance_snapshots
```

Elles servent aux performances analytiques.

---

# 118. Views

Créer des views lorsque cela simplifie l’analyse.

Exemples futurs :

```text
v_invoice_aging
v_customer_profitability
v_job_profitability
v_daily_revenue
v_stock_levels
```

---

# 119. Materialized views

À utiliser seulement lorsque les volumes justifient leur coût.

Exemple :

```text
mv_monthly_financial_metrics
```

---

# 120. RLS

RLS doit utiliser l’organisation courante.

Concept :

```text
organization_id = current_user_organization_id()
```

L’implémentation exacte dépendra de Supabase Auth.

---

# 121. Service Role

La clé Supabase service role :
- backend seulement ;
- jamais navigateur ;
- jamais agent directement.

Même les opérations service role doivent vérifier l’organisation côté application.

---

# 122. Migrations

Toutes les modifications de schéma utilisent des migrations Drizzle.

Interdit en production :

```text
modifier manuellement les tables sans migration
```

Chaque migration est :
- versionnée ;
- revue ;
- testée.

---

# 123. Naming SQL

Tables :

```text
snake_case
plural
```

Exemple :

```text
customer_sites
bank_transactions
agent_runs
```

Colonnes :

```text
snake_case
```

Exemple :

```text
organization_id
created_at
```

---

# 124. Naming TypeScript

Dans le code applicatif :

```text
camelCase
```

Exemple :

```text
organizationId
createdAt
```

Drizzle gère la correspondance avec SQL.

---

# 125. created_at / updated_at

La plupart des tables doivent contenir :

```text
created_at
updated_at
```

`updated_at` doit être mis à jour de manière cohérente.

---

# 126. created_by

Pour les entités importantes, conserver :

```text
created_by_user_id
created_by_agent_id
```

lorsque pertinent.

Cela permet de savoir si l’action vient :
- d’un humain ;
- d’un agent.

---

# 127. Correlation ID

Les workflows complexes doivent partager un :

```text
correlation_id
```

Exemple :

```text
User request
→ Director run
→ Pricing Agent
→ create quote
→ send email
```

Toutes les étapes peuvent être reliées.

---

# 128. Idempotency

Tables critiques avec idempotency :

```text
domain_events
agent_tool_calls
bank_transactions
sync_runs
notifications
```

Les services métier doivent également gérer l’idempotence.

---

# 129. External IDs

Toutes les données synchronisées depuis un provider externe doivent conserver :

```text
provider
external_id
```

Exemple :

```text
Qonto transaction
Google Ads campaign
email message
```

---

# 130. Raw external data

`raw_data JSONB` peut être conservé temporairement pour :
- debug ;
- compatibilité ;
- nouvelle extraction.

Mais éviter de conserver indéfiniment de grosses payloads inutiles.

---

# 131. Rétention

Définir ultérieurement une politique pour :
- logs agentiques ;
- audio ;
- raw API responses ;
- anciens documents ;
- événements.

---

# 132. RGPD

Le modèle doit permettre :
- export des données ;
- rectification ;
- suppression lorsque applicable ;
- anonymisation ;
- traçabilité des accès.

---

# 133. Données personnelles

Catégories :
- identité ;
- coordonnées ;
- employés ;
- conversations ;
- photos ;
- documents.

Ne collecter que les données utiles.

---

# 134. Données hautement sensibles

Limiter l’accès à :
- finance ;
- RH ;
- banque ;
- identité ;
- fiscalité.

Les policies d’accès doivent être testées.

---

# 135. Finance calculée

Ne pas stocker le cash disponible comme vérité primaire.

Calcul :

```text
solde bancaire
+ encaissements attendus fiables
- fournisseurs à payer
- taxes provisionnées
- paie
- réserve minimale
= cash disponible estimé
```

Une table de snapshot peut être créée plus tard.

---

# 136. Marge intervention

Calcul simplifié :

```text
revenue
- labor_cost
- product_cost
- travel_cost
- allocated_other_cost
= contribution_margin
```

Le modèle doit permettre de recalculer la marge.

---

# 137. Coût salarié

Le champ :

```text
employees.hourly_cost
```

est une simplification initiale.

À terme, prévoir éventuellement :
- historique de coût ;
- coût chargé ;
- coût variable selon période.

---

# 138. Historique des coûts

Table future possible :

```text
employee_cost_history
```

Colonnes :

```text
employee_id
valid_from
valid_until
hourly_cost
```

Même principe pour les prix fournisseurs.

---

# 139. Historique prix produit

Table future :

```text
product_cost_history
```

Colonnes :

```text
product_id
supplier_id

unit_cost

valid_from
valid_until

created_at
```

Cela améliore la précision des marges historiques.

---

# 140. Données de trajet

Les calculs de distance peuvent provenir d’une API cartographique.

Ne pas dépendre uniquement des coordonnées manuelles.

Conserver au besoin :
- distance estimée ;
- durée estimée ;
- date du calcul.

---

# 141. Scheduling

La disponibilité ne doit pas être calculée uniquement depuis `jobs`.

Elle devra aussi considérer :
- absences ;
- horaires ;
- certifications ;
- zones ;
- capacité.

---

# 142. Table employee_availability

Future table possible :

```text
employee_availability
```

Colonnes :

```text
employee_id

day_of_week

start_time
end_time

valid_from
valid_until
```

---

# 143. Permissions

Une version future peut ajouter :

```text
permissions
role_permissions
user_permissions
```

MVP :
- rôles fixes côté code.

Évolution :
- permissions configurables.

---

# 144. Agent permissions

Les droits agents ne sont pas nécessairement stockés dans la DB au MVP.

Ils peuvent commencer dans :
- configuration code ;
- définitions agents.

À terme :
- `agent_configs` ;
- policies dynamiques.

---

# 145. Consistance transactionnelle

Les opérations critiques doivent utiliser des transactions PostgreSQL.

Exemple :

```text
quote accepted
↓
update quote
create domain event
create audit log
```

Ces opérations doivent idéalement être atomiques.

---

# 146. Outbox pattern

Pour les événements fiables, envisager un Outbox Pattern.

Concept :

```text
transaction métier
+
insertion événement outbox
```

Puis worker :

```text
lit outbox
→ publie
→ marque traité
```

La table `domain_events` peut jouer ce rôle.

---

# 147. Queue vs Database

La queue ne doit pas être source de vérité.

Redis/BullMQ sert à exécuter.

PostgreSQL conserve :
- état ;
- résultat ;
- traçabilité.

---

# 148. Failures

Un job BullMQ échoué doit laisser suffisamment d’informations en PostgreSQL pour diagnostic.

---

# 149. Dead Letter

Les événements impossibles à traiter après plusieurs tentatives passent en :

```text
dead_letter
```

Ils doivent être visibles dans l’admin.

---

# 150. Agent Cost Tracking

Les coûts IA doivent être calculables par :
- agent ;
- run ;
- utilisateur ;
- client éventuellement ;
- période.

Les colonnes de `agent_runs` fournissent la première base.

---

# 151. Table model_usage

Future table possible :

```text
model_usage
```

Colonnes :

```text
id
organization_id

agent_run_id

provider
model

input_tokens
output_tokens
cached_tokens

cost

created_at
```

Cela permet des analyses détaillées.

---

# 152. Feedback IA

Prévoir :

```text
agent_feedback
```

Colonnes :

```text
id
organization_id

agent_run_id
message_id

user_id

rating

feedback_type
comment

created_at
```

Feedback type :

```text
positive
negative
correction
```

---

# 153. Corrections utilisateur

Les corrections doivent pouvoir alimenter l’apprentissage.

Exemple :

```text
recommended_price = 250
human_corrected_price = 320
reason = infestation severe
```

Ces données doivent être conservées lorsque pertinentes.

---

# 154. Table agent_learning_candidates

Future table :

```text
agent_learning_candidates
```

Colonnes :

```text
id
organization_id

agent_id

type

observation

proposed_change JSONB

evidence JSONB

confidence

status

created_at
reviewed_at
reviewed_by_user_id
```

Statuses :

```text
pending
approved
rejected
applied
```

---

# 155. Auto-apprentissage sécurisé

First AI peut identifier :

```text
pattern
```

Puis proposer :

```text
rule update
pricing adjustment
prompt improvement
workflow change
```

Mais la modification ne doit pas être appliquée directement en production sans processus de validation.

---

# 156. Evals

Les résultats des évaluations peuvent être stockés.

Table future :

```text
agent_eval_runs
```

Colonnes :

```text
id

agent_id
agent_version

eval_suite

score

results JSONB

created_at
```

---

# 157. Configuration métier

Certaines valeurs ne doivent pas être codées en dur.

Exemples :

```text
minimum_margin_rate
quote_validity_days
default_payment_terms
minimum_cash_reserve
```

Les stocker dans :

```text
organization_settings
```

---

# 158. MVP Database Scope

Première implémentation réelle :

```text
organizations
users

customers
contacts
customer_sites

leads

services

quotes
quote_items

jobs
job_reports

tasks

agents
agent_runs
agent_tool_calls

audit_logs
```

Pas plus au premier sprint DB.

---

# 159. Pourquoi limiter le MVP

Ne pas créer immédiatement 50 tables dans les migrations.

Le modèle complet sert de direction.

Les tables sont implémentées lorsque leur feature devient réelle.

Avantages :
- moins de migrations inutiles ;
- moins de refactoring ;
- meilleure compréhension ;
- développement plus rapide.

---

# 160. Phase DB 2

Ajouter :

```text
opportunities
contracts

products
suppliers
stock_locations
stock_movements

job_product_usage

documents
document_links
```

---

# 161. Phase DB 3

Ajouter :

```text
invoices
invoice_items
payments

bank_accounts
bank_transactions

expenses
tax_obligations
```

---

# 162. Phase DB 4

Ajouter :

```text
certifications
employee_absences
working_time_entries

complaints
customer_reviews

marketing_campaigns
tenders
```

---

# 163. Phase DB 5

Ajouter :

```text
memories

domain_events
notifications

approval_requests

integration_connections
sync_runs

feature_flags
organization_settings

conversations
conversation_messages
```

---

# 164. Phase DB 6

Ajouter si besoin :

```text
knowledge_documents
knowledge_chunks

pricing_rules
pricing_history

agent_feedback
agent_learning_candidates
agent_eval_runs

model_usage
```

---

# 165. Fixtures

Prévoir des fixtures de développement.

Exemple :
- une organisation ;
- deux users ;
- dix clients ;
- cinq prospects ;
- cinq services ;
- quelques devis ;
- quelques jobs.

Ne jamais utiliser des données personnelles réelles dans les fixtures publiques.

---

# 166. Seed métier

Le seed peut créer :
- PestType ;
- rôles ;
- agents par défaut ;
- services de démonstration si environnement dev.

Le seed production doit rester prudent.

---

# 167. Agent seed

Agents initiaux :

```text
director
prospecting
qualification
sales
pricing
planning
technician
quality
inventory
cfo
accounting
tax
controlling
collections
marketing
reputation
tenders
hr
```

---

# 168. Version des agents

Ne pas écraser silencieusement une ancienne définition.

Exemple :

```text
director:v1
director:v2
```

Les `agent_runs` conservent la version utilisée.

---

# 169. Migrations et Codex

Lorsque Codex modifie la base :

Il doit :
1. lire `DATABASE.md` ;
2. lire `DOMAIN.md` ;
3. créer le schéma Drizzle ;
4. générer une migration ;
5. ajouter les tests ;
6. ne pas modifier des tables non concernées ;
7. expliquer les migrations destructives avant exécution.

---

# 170. Interdictions Codex DB

Codex ne doit jamais :
- supprimer une table sans demande explicite ;
- supprimer des colonnes arbitrairement ;
- réinitialiser la DB de production ;
- contourner une migration ;
- ajouter des données secrètes dans les seeds.

---

# 171. Repository pattern

L’accès DB doit passer par des repositories ou services.

Exemple :

```text
CustomerRepository
QuoteRepository
JobRepository
```

Les agents ne connaissent pas ces repositories directement.

---

# 172. Exemple architecture Customer

```text
customers.get tool
↓
CustomerService
↓
CustomerRepository
↓
PostgreSQL
```

---

# 173. Transactions métier

Exemple `acceptQuote` :

```text
BEGIN

UPDATE quote

INSERT audit_log

INSERT domain_event

COMMIT
```

Puis le worker traite :

```text
QUOTE_ACCEPTED
```

---

# 174. Atomicité

Éviter :

```text
update quote
```

puis plusieurs secondes après :

```text
insert event
```

car une panne pourrait casser le workflow.

Privilégier une transaction.

---

# 175. Audit automatique

Les services métier sensibles doivent pouvoir produire automatiquement un audit log.

---

# 176. Database timestamps

Définir clairement :
- `created_at`
- `updated_at`
- `deleted_at`

Ne pas multiplier les variantes :

```text
creationDate
created
creation_time
```

---

# 177. Index monitoring

Ne pas créer des dizaines d’indexes hypothétiques.

Observer :
- requêtes lentes ;
- plans SQL ;
- volumes.

Ajouter les indexes nécessaires au fur et à mesure.

---

# 178. Database backups

La production doit disposer de backups.

Objectif minimum :
- backup automatique ;
- politique de rétention ;
- procédure de restauration documentée.

---

# 179. Database recovery

Une sauvegarde non testée n’est pas suffisante.

À terme, réaliser périodiquement un test de restauration sur un environnement séparé.

---

# 180. Staging

L’environnement staging utilise une base différente de production.

Les données doivent être :
- fictives ;
ou
- anonymisées.

---

# 181. Local development

Le développement local doit pouvoir utiliser :
- Supabase local ;
ou
- instance development dédiée.

Le choix sera fixé lors de l’installation technique.

---

# 182. Prisma interdit

La stack choisie utilise :

```text
Drizzle ORM
```

Ne pas ajouter Prisma en parallèle sauf décision d’architecture explicite.

---

# 183. Database source of truth

Le schéma Drizzle et les migrations Git constituent la définition technique de la base.

`DATABASE.md` constitue la définition fonctionnelle et architecturale.

Les deux doivent rester cohérents.

---

# 184. Documentation des tables

Chaque table implémentée doit idéalement avoir :
- commentaire ;
- description ;
- relations ;
- indexes ;
- règles métier importantes.

---

# 185. Validation applicative

Zod valide les inputs avant service.

PostgreSQL garantit ensuite les contraintes essentielles.

Les deux couches sont complémentaires.

---

# 186. Données dérivées

Ne pas stocker une donnée dérivée sauf si :
- performance ;
- historique ;
- audit ;
- snapshot.

Exemple :

```text
invoice.amount_due
```

peut être stocké pour simplicité mais doit rester cohérent.

---

# 187. Ledger financier

First AI n’est pas initialement un logiciel de comptabilité complet.

Ne pas construire immédiatement un grand livre comptable complet.

First AI réalise :
- facturation ;
- rapprochement ;
- pré-comptabilité ;
- analyse ;
- préparation.

---

# 188. Qonto synchronization

Flux prévu :

```text
Qonto API
↓
Qonto adapter
↓
sync service
↓
bank_transactions
↓
reconciliation
```

La synchronisation ne doit jamais modifier le compte bancaire dans le MVP.

---

# 189. Sync cursor

La table `sync_runs` peut conserver :
- cursor ;
- timestamp ;
- dernier external ID.

Pour reprendre une synchronisation efficacement.

---

# 190. Duplicates externes

Toujours utiliser une contrainte unique sur :
- provider ;
- external_id.

Éviter de créer deux fois la même transaction.

---

# 191. Data quality

Prévoir progressivement des contrôles :
- client sans site ;
- facture sans client ;
- job sans service ;
- transaction doublon ;
- produit sans prix ;
- intervention sans rapport.

---

# 192. Health checks

Le système doit pouvoir contrôler :
- connexion DB ;
- migrations ;
- Redis ;
- intégrations.

Mais les credentials ne doivent jamais être exposés.

---

# 193. Database admin

L’interface First AI ne doit pas exposer un éditeur SQL générique.

Les opérations admin passent par des fonctions contrôlées.

---

# 194. Admin views

Écrans techniques futurs :
- migrations ;
- agent runs ;
- failed events ;
- sync errors ;
- queue health ;
- database health.

---

# 195. Objectif analytique final

La base doit permettre de répondre précisément à :

```text
Quel client rapporte le plus ?
```

```text
Quel service génère la meilleure marge par heure ?
```

```text
Quel commercial convertit le mieux ?
```

```text
Quel technicien produit le plus de CA par heure terrain ?
```

```text
Quelles interventions génèrent le plus de SAV ?
```

```text
Quels prix sont trop bas ?
```

```text
Quelle campagne marketing produit la meilleure marge ?
```

```text
Quel sera notre cash dans 30 jours ?
```

```text
Quels impôts devons-nous provisionner ?
```

```text
Quels contrats risquent de ne pas être rentables ?
```

---

# 196. Objectif IA final

La DB doit donner aux agents suffisamment de données structurées pour éviter de raisonner principalement à partir de texte libre.

Exemple :

mauvais :

```text
"Je pense que les interventions cafards sont rentables."
```

bon :

```text
average revenue = 312 €
average actual cost = 104 €
average margin = 208 €
average duration = 71 min
sample size = 184 jobs
```

L’IA peut alors raisonner sur des données fiables.

---

# 197. Principe final

La qualité de First AI dépendra autant de la qualité de sa base de données que de la qualité des modèles IA.

Une IA très performante branchée sur :
- des données incohérentes ;
- des tables mal structurées ;
- des valeurs incomplètes ;

produira de mauvaises décisions.

La donnée métier doit donc rester :
- structurée ;
- cohérente ;
- traçable ;
- historisée lorsque nécessaire ;
- accessible uniquement via les bonnes couches.

---

# 198. Commit

Une fois `DATABASE.md` enregistré :

```bash
git add DATABASE.md
git commit -m "docs: define First AI database architecture"
git log --oneline -6
```

Transmettre ensuite la sortie du terminal.

Le prochain fichier sera :

```text
AGENTS.md
```

Il définira les règles de développement que Codex devra respecter pendant toute la construction de First AI.