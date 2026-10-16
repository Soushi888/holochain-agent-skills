use hdi::prelude::*;

#[derive(Clone, PartialEq)]
#[hdk_entry_helper]
pub struct Post {
    pub title: String,
    pub content: String,
}

pub fn validate_create_post(
    _action: TypedAction<EntryCreationData>,
    post: Post,
) -> ExternResult<ValidateCallbackResult> {
    // Pure and deterministic: the verdict depends only on the entry itself.
    if post.title.trim().is_empty() {
        return Ok(ValidateCallbackResult::Invalid(
            "Post title must not be empty".to_string(),
        ));
    }
    Ok(ValidateCallbackResult::Valid)
}

pub fn validate_update_post(
    _action: TypedAction<UpdateData>,
    _post: Post,
    _original_action: TypedAction<EntryCreationData>,
    _original_post: Post,
) -> ExternResult<ValidateCallbackResult> {
    // TODO: add the appropriate validation rules
    Ok(ValidateCallbackResult::Valid)
}

pub fn validate_delete_post(
    _action: TypedAction<DeleteData>,
    _original_action: TypedAction<EntryCreationData>,
    _original_post: Post,
) -> ExternResult<ValidateCallbackResult> {
    // TODO: add the appropriate validation rules
    Ok(ValidateCallbackResult::Valid)
}

pub fn validate_create_link_post_updates(
    action: TypedAction<CreateLinkData>,
) -> ExternResult<ValidateCallbackResult> {
    let action_hash = action
        .data
        .base_address
        .into_action_hash()
        .ok_or(wasm_error!(WasmErrorInner::Guest(
            "No action hash associated with link".to_string()
        )))?;
    let record = must_get_valid_record(action_hash)?;
    let _post: crate::Post = record
        .entry()
        .to_app_option()
        .map_err(|e| wasm_error!(e))?
        .ok_or(wasm_error!(WasmErrorInner::Guest(
            "Linked action must reference an entry".to_string()
        )))?;
    let action_hash = action
        .data
        .target_address
        .into_action_hash()
        .ok_or(wasm_error!(WasmErrorInner::Guest(
            "No action hash associated with link".to_string()
        )))?;
    let record = must_get_valid_record(action_hash)?;
    let _post: crate::Post = record
        .entry()
        .to_app_option()
        .map_err(|e| wasm_error!(e))?
        .ok_or(wasm_error!(WasmErrorInner::Guest(
            "Linked action must reference an entry".to_string()
        )))?;
    // TODO: add the appropriate validation rules
    Ok(ValidateCallbackResult::Valid)
}

pub fn validate_delete_link_post_updates(
    _action: TypedAction<DeleteLinkData>,
    _original_action: TypedAction<CreateLinkData>,
) -> ExternResult<ValidateCallbackResult> {
    Ok(ValidateCallbackResult::Invalid(
        "PostUpdates links cannot be deleted".to_string(),
    ))
}
