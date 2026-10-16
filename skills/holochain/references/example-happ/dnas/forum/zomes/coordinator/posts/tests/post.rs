use holochain::conductor::api::error::ConductorApiError;
use holochain::conductor::CellError;
use holochain::core::workflow::WorkflowError;
use holochain::prelude::*;
use holochain::sweettest::*;
use posts::post::*;
use posts_integrity::*;
use std::path::Path;

mod common;
use common::*;

#[tokio::test(flavor = "multi_thread")]
async fn create_post() {
    // Create a conductor with the standard config
    let mut conductor = SweetConductor::standard().await;
    let dna_path = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../../workdir/forum.dna");
    let dna_file = SweetDnaFile::from_bundle(&dna_path).await.unwrap();
    let app = conductor.setup_app("test-app", &[dna_file]).await.unwrap();
    let zome = app.cells()[0].zome("posts");

    let post = sample_post(&conductor, &zome).await;

    // Agent creates a Post
    let _: Record = conductor.call(&zome, "create_post", post.clone()).await;
}

#[tokio::test(flavor = "multi_thread")]
async fn create_and_read_post() {
    // Create conductors with the standard config
    let mut conductors = SweetConductorBatch::standard(2).await;
    let dna_path = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../../workdir/forum.dna");
    let dna_file = SweetDnaFile::from_bundle(&dna_path).await.unwrap();
    let apps = conductors.setup_app("test-app", &[dna_file]).await.unwrap();
    let cells = apps.cells_flattened();
    let alice_conductor = conductors.get(0).unwrap();
    let alice_zome = cells[0].zome("posts");
    let bob_conductor = conductors.get(1).unwrap();
    let bob_zome = cells[1].zome("posts");

    let post = sample_post(&alice_conductor, &alice_zome).await;

    // Alice creates a Post
    let record: Record = alice_conductor
        .call(&alice_zome, "create_post", post.clone())
        .await;

    // Wait for the created entry to be propagated to the other node.
    await_consistency(&cells).await.unwrap();

    // Bob gets the created Post
    let propagated_record: Record = bob_conductor
        .call(
            &bob_zome,
            "get_original_post",
            record.signed_action.hashed.hash.clone(),
        )
        .await;
    assert_eq!(record, propagated_record);
}

#[tokio::test(flavor = "multi_thread")]
async fn create_and_update_post() {
    // Create conductors with the standard config
    let mut conductors = SweetConductorBatch::standard(2).await;
    let dna_path = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../../workdir/forum.dna");
    let dna_file = SweetDnaFile::from_bundle(&dna_path).await.unwrap();
    let apps = conductors.setup_app("test-app", &[dna_file]).await.unwrap();
    let cells = apps.cells_flattened();
    let alice_conductor = conductors.get(0).unwrap();
    let alice_zome = cells[0].zome("posts");
    let bob_conductor = conductors.get(1).unwrap();
    let bob_zome = cells[1].zome("posts");

    let post = sample_post(&alice_conductor, &alice_zome).await;

    // Alice creates a Post
    let record: Record = alice_conductor
        .call(&alice_zome, "create_post", post.clone())
        .await;

    let original_action_hash = record.signed_action.hashed.hash.clone();

    // Alice updates the Post
    let content_update = sample_post(&alice_conductor, &alice_zome).await;
    let update_input = UpdatePostInput {
        original_post_hash: original_action_hash.clone(),
        previous_post_hash: original_action_hash.clone(),
        updated_post: content_update.clone(),
    };
    let updated_record: Record = alice_conductor
        .call(&alice_zome, "update_post", update_input)
        .await;

    // Wait for the updated entry to be propagated to the other node.
    await_consistency(&cells).await.unwrap();

    // Bob gets the updated Post
    let read_updated_record_1: Record = bob_conductor
        .call(
            &bob_zome,
            "get_latest_post",
            updated_record.signed_action.hashed.hash.clone(),
        )
        .await;
    assert_eq!(updated_record, read_updated_record_1);

    // Alice updates the Post again
    let content_update = sample_post(&alice_conductor, &alice_zome).await;
    let update_input = UpdatePostInput {
        original_post_hash: original_action_hash.clone(),
        previous_post_hash: updated_record.signed_action.hashed.hash.clone(),
        updated_post: content_update.clone(),
    };
    let updated_record: Record = alice_conductor
        .call(&alice_zome, "update_post", update_input)
        .await;

    // Wait for the updated entry to be propagated to the other node.
    await_consistency(&cells).await.unwrap();

    // Bob gets the updated Post
    let read_updated_record_2: Record = bob_conductor
        .call(
            &bob_zome,
            "get_latest_post",
            updated_record.signed_action.hashed.hash.clone(),
        )
        .await;
    let RecordEntry::Present(entry) = read_updated_record_2.entry else {
        panic!(
            "Expected Present entry, got {:?}",
            read_updated_record_2.entry
        );
    };
    assert_eq!(Post::try_from(entry.clone()).unwrap(), content_update);

    // Bob gets all the revisions for Post
    let revisions: Vec<Record> = bob_conductor
        .call(
            &bob_zome,
            "get_all_revisions_for_post",
            original_action_hash,
        )
        .await;
    assert_eq!(revisions.len(), 3);
    let RecordEntry::Present(ref entry) = revisions[2].entry else {
        panic!("Expected Present entry, got {:?}", revisions[2].entry);
    };
    assert_eq!(Post::try_from(entry).unwrap(), content_update);
}

#[tokio::test(flavor = "multi_thread")]
async fn create_and_delete_post() {
    // Create conductors with the standard config
    let mut conductors = SweetConductorBatch::standard(2).await;
    let dna_path = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../../workdir/forum.dna");
    let dna_file = SweetDnaFile::from_bundle(&dna_path).await.unwrap();
    let apps = conductors.setup_app("test-app", &[dna_file]).await.unwrap();
    let cells = apps.cells_flattened();
    let alice_conductor = conductors.get(0).unwrap();
    let alice_zome = cells[0].zome("posts");
    let bob_conductor = conductors.get(1).unwrap();
    let bob_zome = cells[1].zome("posts");

    let post = sample_post(&alice_conductor, &alice_zome).await;

    // Alice creates a Post
    let record: Record = alice_conductor
        .call(&alice_zome, "create_post", post.clone())
        .await;

    // Wait for the created entry to be propagated to the other node.
    await_consistency(&cells).await.unwrap();

    // Alice deletes the Post
    let _delete_action_hash: ActionHash = alice_conductor
        .call(
            &alice_zome,
            "delete_post",
            record.signed_action.hashed.hash.clone(),
        )
        .await;

    // Wait for the entry deletion to be propagated to the other node.
    await_consistency(&cells).await.unwrap();

    // Bob gets the oldest delete for the Post
    let oldest_delete_for_post: Option<SignedActionHashed> = bob_conductor
        .call(
            &bob_zome,
            "get_oldest_delete_for_post",
            record.signed_action.hashed.hash.clone(),
        )
        .await;
    assert!(oldest_delete_for_post.is_some());

    // Bob gets the deletions for the Post
    let deletes_for_post: Option<Vec<SignedActionHashed>> = bob_conductor
        .call(
            &bob_zome,
            "get_all_deletes_for_post",
            record.signed_action.hashed.hash.clone(),
        )
        .await;
    assert_eq!(deletes_for_post.unwrap().len(), 1);
}

#[tokio::test(flavor = "multi_thread")]
async fn create_post_with_empty_title_is_rejected() {
    let mut conductor = SweetConductor::standard().await;
    let dna_path = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../../workdir/forum.dna");
    let dna_file = SweetDnaFile::from_bundle(&dna_path).await.unwrap();
    let app = conductor.setup_app("test-app", &[dna_file]).await.unwrap();
    let zome = app.cells()[0].zome("posts");

    // A whitespace-only title is empty after trimming, so integrity validation rejects it.
    let invalid_post = Post {
        title: "   ".to_string(),
        content: "Some content".to_string(),
    };

    let result: Result<Record, _> = conductor
        .call_fallible(&zome, "create_post", invalid_post)
        .await;

    // The commit is refused by the author's own inline validation, which surfaces as
    // `InvalidCommit` carrying the `Invalid(..)` message from the integrity zome. Matching
    // this variant and message separates a validation rejection from any other failure.
    match result {
        Err(ConductorApiError::CellError(CellError::WorkflowError(workflow_error))) => {
            match *workflow_error {
                WorkflowError::SourceChainError(error) => {
                    let reason = error.to_string();
                    assert!(
                        reason.starts_with("InvalidCommit error:"),
                        "not a validation rejection: {reason}"
                    );
                    assert!(
                        reason.contains("Post title must not be empty"),
                        "unexpected rejection reason: {reason}"
                    );
                }
                other => panic!("expected a source chain error, got {other:?}"),
            }
        }
        other => panic!("expected a validation rejection, got {other:?}"),
    }
}
