/** 
 * displays history of events associated with a security session 
 * 
 * event timestamps, previous session activities
 * part of sessiondetails
 */

<div> 
    <ol className="relative">
    <li className="relative flex gap-4 pb-8 last:pb-0">

        <div className="relative flex w-8 flex-none flex-col items-center">
        <span className="z-10 flex h-8 w-8 items-center justify-center rounded-full
                    bg-sky-500 text-white ring-4 ring-white dark:ring-slate-900">
        </span>
        <span className="absolute top-8 bottom-0 w-px bg-slate-200
                    dark:bg-slate-700 last:hidden"></span>
        </div>

        <div className="flex-1 pt-1">
        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
            Order was shipped
        </p>
        <time className="text-xs text-slate-400">2 hours ago</time>
        </div>
    </li>
    </ol>
</div> 
