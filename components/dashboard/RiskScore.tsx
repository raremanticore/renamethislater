/** 
 * visually display security risk score of a selected session
 * risk scores shoullldd come from backend???
 */

<div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-lg">
  <h3 className="text-lg font-semibold text-slate-200 mb-4">Risk Score</h3>
  <label htmlFor="file" className="text-4xl font-bold text-red-400">
    67
  </label>
  <label htmlFor="file" className="text-sm text-slate-400 ml-1">
    /100
  </label>
  <progress
    id="file"
    value={67}
    max={100}
    className="w-full h-3 mt-4 rounded-full overflow-hidden accent-red-500"
  >
    67%
  </progress>
</div>