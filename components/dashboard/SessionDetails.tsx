
/**
 *
 * displays security information about a selected session
 *
 * needs to show risk score, activity timeline, & triggered security rules
 *
 * AI generated explanation so arham over here
 *
 * should differ when different sessions are selected
 */

import RiskScore from "./RiskScore";
import ActivityTimeline from "./ActivityTimeline";
import TriggeredRules from "./TriggeredRules";
import AIExplanation from "./AIExplanation";

export default function SessionDetails() {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-lg space-y-6">
      <div className="card-one">
        <h2 className="text-3xl font-medium text-slate-100">Session Details</h2>
        <p className="text-sm font-bold text-white mt-3">Session ID : S-1022</p>
      </div>

      <div className="border-t border-slate-700 pt-6">
        <RiskScore />
      </div>

      <div className="border-t border-slate-700 pt-6">
        <ActivityTimeline />
      </div>

      <div className="border-t border-slate-700 pt-6">
        <TriggeredRules />
      </div>

      <div className="border-t border-slate-700 pt-6">
        <AIExplanation />
      </div>
    </div>
  );
}
