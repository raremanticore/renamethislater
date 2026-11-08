/** 
 * displays live security events such as : 
 * event timestamps
 * session ids
 * requested actions
 * if requests were allowed or not
 * ai reasoning???
 */

export default function LiveActivityTable() {
  return (
    <div className="relative flex flex-col w-full h-full overflow-scroll text-gray-700 bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-lg">
        <table className="w-full text-left table-auto min-w-max">
        <thead>
            <tr>
            <th className="p-4 border-b border-slate-50 bg-slate-800">Time</th>
            <th>Session ID</th>
            <th>Action</th>
            <th>Status</th>
            <th>Reason</th>
            </tr>
        </thead>
        <tbody>
            <tr className="hover:bg-slate-600">
            <th className="p-4 border-b border-slate-50 bg-slate-800" >Row 1 Live Sync</th>
            <th className="p-4 border-b border-slate-50 bg-slate-800" >Row 1 Live Sync</th>
            <th className="p-4 border-b border-slate-50 bg-slate-800" >Row 1 Live Sync</th>
            <th className="p-4 border-b border-slate-50 bg-slate-800" >Row 1 Live Sync</th>
            <th className="p-4 border-b border-slate-50 bg-slate-800" >Row 1 Live Sync</th>
            </tr>
            <tr className="hover:bg-slate-600">
            <th className="p-4 border-b border-slate-50 bg-slate-800">Row 2 Live Sync</th>
            <th className="p-4 border-b border-slate-50 bg-slate-800">Row 2 Live Sync</th>
            <th className="p-4 border-b border-slate-50 bg-slate-800">Row 2 Live Sync</th>
            <th className="p-4 border-b border-slate-50 bg-slate-800">Row 2 Live Sync</th>
            <th className="p-4 border-b border-slate-50 bg-slate-800">Row 2 Live Sync</th>
            </tr>
            <tr className="hover:bg-slate-600">
            <th className="p-4 border-b border-slate-50 bg-slate-800">Row 3 Live Sync</th>
            <th className="p-4 border-b border-slate-50 bg-slate-800">Row 3 Live Sync</th>
            <th className="p-4 border-b border-slate-50 bg-slate-800">Row 3 Live Sync</th>
            <th className="p-4 border-b border-slate-50 bg-slate-800">Row 3 Live Sync</th>
            <th className="p-4 border-b border-slate-50 bg-slate-800">Row 3 Live Sync</th>
            </tr>
            <tr className="hover:bg-slate-600">
            <th className="p-4 border-b border-slate-50 bg-slate-800">Row 4 Live Sync</th>
            <th className="p-4 border-b border-slate-50 bg-slate-800">Row 4 Live Sync</th>
            <th className="p-4 border-b border-slate-50 bg-slate-800">Row 4 Live Sync</th>
            <th className="p-4 border-b border-slate-50 bg-slate-800">Row 4 Live Sync</th>
            <th className="p-4 border-b border-slate-50 bg-slate-800">Row 4 Live Sync</th>
            </tr>
        </tbody>
        </table>
    </div>
    );
}
