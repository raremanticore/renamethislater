
/** 
 * main security dashboard 
 * this is the main container for the page 
 * organizes all components, controls the layout, and connects sections
 */

import SecurityStats from "./SecurityStats";
import LiveActivityTable from "./LiveActivityTable";
import SessionDetails from "./SessionDetails";

export default function SecurityDashboard() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-8">
      <h1 className="text-3xl font-bold text-white mb-8">
        Security Dashboard
      </h1>

      <div className="flex flex-col gap-8">
        <SecurityStats />
        <LiveActivityTable />
        <SessionDetails />
      </div>
    </div>
  );
}
