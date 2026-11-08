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
    <div className="relative flex flex-col w-full h-full overflow-auto text-slate-200 bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-lg">
        <table className="w-full text-left table-auto min-w-max">
        <thead>
            <tr>
            <th className="p-4 border-b border-slate-700 bg-slate-800 text-slate-300 text-sm font-semibold">Time</th>
            <th className="p-4 border-b border-slate-700 bg-slate-800 text-slate-300 text-sm font-semibold">Session ID</th>
            <th className="p-4 border-b border-slate-700 bg-slate-800 text-slate-300 text-sm font-semibold">Action</th>
            <th className="p-4 border-b border-slate-700 bg-slate-800 text-slate-300 text-sm font-semibold">Status</th>
            <th className="p-4 border-b border-slate-700 bg-slate-800 text-slate-300 text-sm font-semibold">Reason</th>
            </tr>
        </thead>
        <tbody>
            <tr className="hover:bg-slate-800 transition-colors">
            <td className="p-4 border-b border-slate-800 text-slate-200 text-sm">Row 1 Live Sync</td>
            <td className="p-4 border-b border-slate-800 text-slate-200 text-sm">Row 1 Live Sync</td>
            <td className="p-4 border-b border-slate-800 text-slate-200 text-sm">Row 1 Live Sync</td>
            <td className="p-4 border-b border-slate-800 text-slate-200 text-sm">Row 1 Live Sync</td>
            <td className="p-4 border-b border-slate-800 text-slate-200 text-sm">Row 1 Live Sync</td>
            </tr>
            <tr className="hover:bg-slate-800 transition-colors">
            <td className="p-4 border-b border-slate-800 text-slate-200 text-sm">Row 2 Live Sync</td>
            <td className="p-4 border-b border-slate-800 text-slate-200 text-sm">Row 2 Live Sync</td>
            <td className="p-4 border-b border-slate-800 text-slate-200 text-sm">Row 2 Live Sync</td>
            <td className="p-4 border-b border-slate-800 text-slate-200 text-sm">Row 2 Live Sync</td>
            <td className="p-4 border-b border-slate-800 text-slate-200 text-sm">Row 2 Live Sync</td>
            </tr>
            <tr className="hover:bg-slate-800 transition-colors">
            <td className="p-4 border-b border-slate-800 text-slate-200 text-sm">Row 3 Live Sync</td>
            <td className="p-4 border-b border-slate-800 text-slate-200 text-sm">Row 3 Live Sync</td>
            <td className="p-4 border-b border-slate-800 text-slate-200 text-sm">Row 3 Live Sync</td>
            <td className="p-4 border-b border-slate-800 text-slate-200 text-sm">Row 3 Live Sync</td>
            <td className="p-4 border-b border-slate-800 text-slate-200 text-sm">Row 3 Live Sync</td>
            </tr>
            <tr className="hover:bg-slate-800 transition-colors">
            <td className="p-4 border-b border-slate-800 text-slate-200 text-sm">Row 4 Live Sync</td>
            <td className="p-4 border-b border-slate-800 text-slate-200 text-sm">Row 4 Live Sync</td>
            <td className="p-4 border-b border-slate-800 text-slate-200 text-sm">Row 4 Live Sync</td>
            <td className="p-4 border-b border-slate-800 text-slate-200 text-sm">Row 4 Live Sync</td>
            <td className="p-4 border-b border-slate-800 text-slate-200 text-sm">Row 4 Live Sync</td>
            </tr>
        </tbody>
        </table>
    </div>
    );
}