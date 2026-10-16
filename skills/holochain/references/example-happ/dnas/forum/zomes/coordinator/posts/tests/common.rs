use hdk::prelude::*;
use holochain::sweettest::{SweetConductor, SweetZome};
use posts_integrity::*;

pub async fn sample_post(conductor: &SweetConductor, zome: &SweetZome) -> Post {
    Post {
        title: "A valid title".to_string(),
        content: Default::default(),
    }
}

pub async fn create_post(conductor: &SweetConductor, zome: &SweetZome) -> Record {
    conductor
        .call(&zome, "create_post", sample_post(conductor, zome).await)
        .await
}
