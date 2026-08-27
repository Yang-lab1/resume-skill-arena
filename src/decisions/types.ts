export interface ChangeReference {
  changeSetId: string;
  changeId: string;
}

interface DecisionEventBase {
  eventId: string;
  sequence: number;
  baselineId: string;
  createdAt: string;
}

export interface SelectDecisionEvent extends DecisionEventBase, ChangeReference {
  type: "SELECT";
}

export interface RejectDecisionEvent extends DecisionEventBase, ChangeReference {
  type: "REJECT";
}

export interface EditDecisionEvent extends DecisionEventBase {
  type: "EDIT";
  sourceBlockId: string;
  proposedText: string;
  factConfirmed: true;
  basedOn?: ChangeReference;
}

export interface UndoDecisionEvent extends DecisionEventBase {
  type: "UNDO";
  targetEventId: string;
}

export type OrdinaryDecisionEvent =
  | SelectDecisionEvent
  | RejectDecisionEvent
  | EditDecisionEvent;
export type DecisionEvent = OrdinaryDecisionEvent | UndoDecisionEvent;

export interface DecisionLog {
  schemaVersion: "0.1";
  decisionLogId: string;
  baselineId: string;
  createdAt: string;
  updatedAt: string;
  events: DecisionEvent[];
}

export type DecisionInput =
  | Omit<SelectDecisionEvent, keyof DecisionEventBase>
  | Omit<RejectDecisionEvent, keyof DecisionEventBase>
  | (Omit<EditDecisionEvent, keyof DecisionEventBase | "factConfirmed"> & {
      factConfirmed: boolean;
    });

