# Scheduled Functions

Running work on a timer inside a coordinator zome. Every shape below is taken from the shipped `hdk 0.7.1` and `holochain_zome_types 0.7.1` sources, not from recall.

## The API

```rust
pub fn schedule(scheduled_fn: &str) -> ExternResult<()>
```

The only argument is the name of a schedulable function in the **current zome**. There is no cross-zome scheduling.

```rust
pub enum Schedule {
    /// Crontab syntax string. Survives a conductor reboot.
    Persisted(String),
    /// Runs once after this duration. Does not survive a reboot.
    Ephemeral(Duration),
}
```

## Writing a scheduled function

A scheduled function is infallible. Its only input is the schedule that triggered it, and its only output is its next trigger. Use `#[hdk_extern(infallible)]`.

```rust
use hdk::prelude::*;

#[hdk_extern(infallible)]
fn cleanup_expired(_previous: Option<Schedule>) -> Option<Schedule> {
    // do the work, swallow every error

    // ask to run again in five minutes, best effort
    Some(Schedule::Ephemeral(std::time::Duration::from_secs(300)))
}

#[hdk_extern]
pub fn start_cleanup(_: ()) -> ExternResult<()> {
    schedule("cleanup_expired")
}
```

The signature is fixed at `Option<Schedule> -> Option<Schedule>`. You cannot pass arguments in and you cannot return data out. That is deliberate: it removes the chance of a caller who merely holds a cap grant smuggling in data that the chain author would then execute as themselves.

The first invocation always receives `None`. Every later invocation receives whatever the previous invocation returned.

## Persisted versus ephemeral

| | `Persisted(crontab)` | `Ephemeral(duration)` |
|---|---|---|
| Survives conductor reboot | Yes | No |
| Survives an irrecoverable error | Yes | No |
| Repeats | Yes, per the crontab | No, one shot per return value |
| To keep the schedule | Return the **same** crontab every time | Return a new `Ephemeral` every time |

A persisted function must keep returning the same crontab if it wants to keep its schedule. It may change it by returning a different crontab, an `Ephemeral`, or `None` to stop.

An invalid crontab, for example `"*/0 * * * * * *"`, unschedules the function. So does a failed call.

A missed persisted trigger, because the conductor or the host was down, does **not** fire late. It is skipped and rescheduled for the next intended run time.

`Ephemeral(Duration::ZERO)` means "next scheduler tick", not "immediately".

## Five rules that bite

1. **Scheduled functions always run as the author of the chain they run for.** The provenance of whoever called `schedule()` is gone the moment that zome call returns. Put your cap grant check in front of the `schedule()` call, never inside the scheduled function, because by then there is no caller to check.

2. **Scheduling is idempotent.** Calling `schedule()` on an already-scheduled function is a noop, and the existing schedule wins. If the function is not currently scheduled, it is queued for the next scheduler iteration even if it recently returned `None`.

3. **Do not depend on the loop frequency.** The conductor's scheduler loop has historically ranged from 100ms to 10s and may become configurable. Anything that needs precise timing does not belong in the scheduler.

4. **Assume a malicious agent can trigger your function at the wrong time.** Write the body defensively: check the current time window yourself, and noop, delay, or terminate if you were triggered outside it.

5. **`init` is lazy.** It does not run until some other zome call runs for the first time after installation. Scheduling from `init` is allowed, but the schedule may start late or never if nobody calls the cell.

## Errors

```rust
pub enum ScheduleError {
    Cron(String),
    Timestamp(TimestampError),
}
```

`Cron` almost always means a malformed crontab string. Parse failures unschedule the function rather than retrying.

## When not to use the scheduler

Scheduled functions write to the calling agent's own source chain as that agent. If the work is "react to something another agent did", a remote signal plus `post_commit` is usually the better shape. See `patterns.md` for signals and `access-control.md` for the cap grant that `recv_remote_signal` needs.
