/**
 * displays the 3 security cards at the start
 * 
 * cards : active sessions, flagged sessions, blocked requests
 * 
 * values will be filled in with capital one nessie api mock data
 */


export default function SecurityStats() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-lg">
        <div className="column-one">
          <div className="card-one">
            <h2 className="text-sm font-medium text-slate-400">Active Sessions</h2>
            <p className="text-3xl font-bold text-white mt-3">24</p>
          </div>
        </div>
      </div>
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-lg">
        <div className="column-two">
          <div className="card-two">
            <h2 className="text-sm font-medium text-slate-400">Flagged Sessions</h2>
            <p className="text-3xl font-bold text-white mt-3">5</p>
          </div>
        </div>
      </div>
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-lg">
        <div className="column-three">
          <div className="card-three">
            <h2 className="text-sm font-medium text-slate-400">Blocked Requests</h2>
            <p className="text-3xl font-bold text-white mt-3">12</p>
          </div>
        </div>
      </div>
    </div>
  );
}
