# Project KRUNCH — Financial reconciliation and simplification review

**Date:** 21 November 2026  
**Status:** Initial verified audit of existing GitHub main code and read-only SQL queries of the live Supabase database. No financial records changed.  
**Scope:** Existing project item/task costs, item payments, ledger payments and funding, GST flags, overlapping scope, and interface simplification.

## 1. Present records
- 90 project records: 51 Items and 39 Tasks.
- 6 financial transactions.
- 12 schedule metadata records.
- One shared Supabase master remains connected to Google Sheets.

## 2. Reproduction of current dashboard calculation
Exact client calculation found in `openingForecast()`:
- `gross(x) = (actual>0 ? actual : estimate) × (gst_mode==='exclusive' ? 1.1 : 1)`
- Include every record except Item/Wishlist; **Task estimated costs are included**.
- For each item, linked ledger payments replace `amount_paid` entirely rather than being added to it.
- Unlinked payments are included in projected expenditure and paid.
- The bank guarantee is identified by a text search in the transaction description and subtracted from expected/paid.
- Remaining calculated as sum of max(0, gross - paid) over included records.

### Current reproducible figures, **NOT approved budget figures**
| Metric | AUD | Qualification |
|---|---:|---|
| Gross cost of included Item records | 103,456.50 | Mixed GST reliability; includes unconfirmed scope |
| Gross estimates on included Task records | 21,060.00 | Seven Tasks have monetary estimates |
| Gross core total | 124,516.50 | Includes Tasks + Items; possible duplicates |
| Separate unlinked payments | 57,433.53 | Rent/holding deposit plus bank guarantee |
| Bank guarantee subtracted | (49,228.74) | Cash held, should remain distinct from cost |
| **Current dashboard projected fit-out cost** | **132,721.29** | 124,516.50 + 57,433.53 - 49,228.74 |
| Recorded item payments | 13,026.40 | Includes griddle deposit; linked ledger is empty |
| **Current dashboard already spent** | **21,231.19** | Item paid + unlinked payments - bank guarantee |
| **Current dashboard still to spend** | **111,490.10** | Outstanding from core records only |
| Wishlist | 9,070.00 | Excluded from core |
| Unpriced non-wishlist items | 3 | In addition to unconfirmed prices and scopes |

**The arithmetic reconciles internally:** 21,231.19 + 111,490.10 = 132,721.29.  
**That does not mean the budget is economically correct.** Cost classification, GST, deposits and scope overlap still require reconciliation.

## 3. Specific problems
1. **Task budgets can duplicate Item budgets.** Seven Task records carry $21,060 nominal estimates. Relevant examples: exterior painting $7,000, front tiling $4,500, painting $3,000, signage $2,500, menu-screen joinery $2,000, optional rear tiling $1,260, and awning $800. Some notes explicitly flag possible overlap: signage allowance overlaps K028/K029; awning potentially overlaps K033. These should be mapped to a single cost scope before being included.
2. **GST uncertainty is material.** 33 costed records have `gst_mode='unknown'` with a nominal total of $68,625.10. Code treats unknown GST as though inclusive, even though it is not verified.
3. **A quote can look like an actual expense.** A $2,908.40 decorative wall-panel record is `Quote received` while `actual=2908.40`, with $0 paid. The budget area's “actual spent” uses `sum(actual)`, which is not a cash-paid total.
4. **Paid-in-full status inconsistent.** Yakasi automatic deli slicer: actual cost $586.20; recorded paid $240.80; payment status “Paid in full”. Unexplained difference $345.40. This could reflect an omitted payment entry; do not silently adjust.
5. **Two different finance pathways.** The Payments view includes item `amount_paid` unless a linked ledger payment exists, plus ledger payments. The opening forecast uses the same replacement logic but excludes the bank guarantee from “already spent”. Both require clear labelling.
6. **Funds received must not be netted into costs.** Existing funding ledger shows Sam $8,204.79 + $29,228.74, Allan $20,000, silent partner $30,000. Funding is separate from business expenditure. Bank guarantee $49,228.74 is cash tied up rather than an operating fit-out expense.
7. **Deposit allocation.** Three Waldorf items total actual $12,000 ex GST (per record) and a single $1,500 deposit is allocated to the griddle. That may be fine as a single-payment allocation, but must not be allocated again to fryers.
8. **Cost completeness and double-counting.** “Kitchen extras” allowance, tiling materials, tiler cost, and task installation estimates have plausible scope overlap. Verify supplier invoices before replacing any numbers.

## 4. Recommended corrected model
A. **Costs**: Every real bill or forecast belongs to one unique spend line. Tasks are operational instructions and never create a second expense by themselves. Each project Item/Cost can link to Task(s), but the link does not duplicate money.
B. **Cost state**: `Estimated` / `Quoted` / `Committed` / `Invoiced` / `Purchased`; separate from fulfilment progress.
C. **GST basis**: `Inclusive` / `Exclusive` / `Unknown`. Do not convert unknown into a precise tax-inclusive total. Display known versus GST-to-confirm.
D. **Payments**: Primary ledger with unique payment IDs and allocations to item/invoice. Sum payment amounts exactly once. Deposits and balances must reconcile with invoices.
E. **Funding**: Contributions / landlord CapEx / cash held as guarantee recorded in a separate funding and cash availability panel. Landlord contribution is not negative expenditure.
F. **Dashboard**: Four main figures after reconciliation: expected fit-out cost, paid toward fit-out, remaining committed or estimated, and unpriced/unverified exposure. Show guarantee and landlord funding separately.
G. **Confidence labels**: Before reconciliation, visibly mark totals “Provisional / needs review”, rather than implying accuracy.

## 5. Proposed simplified mobile interface — no live changes yet
- **Home**: Today's urgent jobs, next milestone, high-level *provisional* budget.
- **Tasks**: Name, one of Not started/In progress/Completed, date and notes; optional Owner in More details.
- **Calendar**: Appointments/milestones, not a duplicate task registry.
- **Purchases**: Item, supplier, price, paid, ordered/delivered; one cost record only.
- **Budget**: Four summary figures with tap-to-audit item drill-down and separate funding/guarantee section.
- Keep advanced classification, payment details and references in a More details expansion, not deleted.
- Keep Google Sheets connected; do not rename synced columns or table IDs until the bridge is updated and tested.

## 6. Safe build order
1. Verify financial scope duplicates and GST with invoices. Audit-only; no existing values changed.
2. Create a fully read-only audit dashboard against current data; flag uncertain classifications.
3. Add a simplified interface on a dedicated GitHub development branch, with no database writes.
4. Reconcile disputed amounts by user approval, then adjust cost/payment logic with tests.
5. Test consistency with Google Sheets and both users, then promote after sign-off.

## 7. Needed user decisions for high-value exceptions
- Is “Exterior painting” $7,000 a separate external-work allowance from “Painting” $3,000?
- Do front tiling labour $4,500 and “Tiler” $6,300 represent separate scopes or overlap?
- Does “Signage” $2,500 overlap Roadside sign $1,200 and flags $700?
- Does the Yakasi $345.40 paid-in-full gap represent another payment not yet recorded?

**Do not auto-resolve these ambiguities from item names alone.**
