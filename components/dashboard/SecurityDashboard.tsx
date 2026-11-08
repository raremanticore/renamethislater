/** 
 * main security dashboard 
 * this is the main container for the page 
 * organizes all components, controls the layout, and connects sections
 */

import SecurityStats from "./SecurityStats";

export default function SecurityDashboard() {
  return (
    <div>
      <h1>Security Dashboard</h1>

      <SecurityStats />
    </div>
  );
}