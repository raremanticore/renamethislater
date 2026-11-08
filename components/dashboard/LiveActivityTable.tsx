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
    <table>
    <tbody>
        <tr className="column-headers">
        <th>Time</th>
        <th>Session ID</th>
        <th>Action</th>
        <th>Status</th>
        <th>Reason</th>
        </tr>
        <tr className="row-one">
        <th>Row 1 Live Sync</th>
        <th>Row 1 Live Sync</th>
        <th>Row 1 Live Sync</th>
        <th>Row 1 Live Sync</th>
        <th>Row 1 Live Sync</th>
        </tr>
        <tr className="row-two">
        <th>Row 2 Live Sync</th>
        <th>Row 2 Live Sync</th>
        <th>Row 2 Live Sync</th>
        <th>Row 2 Live Sync</th>
        <th>Row 2 Live Sync</th>
        </tr>
        <tr className="row-three">
        <th>Row 3 Live Sync</th>
        <th>Row 3 Live Sync</th>
        <th>Row 3 Live Sync</th>
        <th>Row 3 Live Sync</th>
        <th>Row 3 Live Sync</th>
        </tr>
        <tr className="row-four">
        <th>Row 4 Live Sync</th>
        <th>Row 4 Live Sync</th>
        <th>Row 4 Live Sync</th>
        <th>Row 4 Live Sync</th>
        <th>Row 4 Live Sync</th>
        </tr>
    </tbody>
    </table>
    );
}
