const { Octokit } = require('@octokit/rest');
const fs = require('fs');
const path = require('path');

class AndroidPackager {
  constructor(githubToken) {
    this.octokit = new Octokit({ auth: githubToken });
    this.repoName = 'scratch-android-app-' + Date.now();
  }

  async createTemporaryRepo() {
    // Create a temporary repository
    const { data: repo } = await this.octokit.repos.createForAuthenticatedUser({
      name: this.repoName,
      auto_init: true,
      private: true
    });

    return repo;
  }

  async copyHtmlToRepo(htmlContent, repo) {
    // Create a new file in the repository with the HTML content
    await this.octokit.repos.createOrUpdateFileContents({
      owner: repo.owner.login,
      repo: repo.name,
      path: 'www/index.html',
      message: 'Add Scratch HTML file',
      content: Buffer.from(htmlContent).toString('base64')
    });
  }

  async triggerWorkflow(repo) {
    // Trigger the workflow dispatch event
    await this.octokit.actions.createWorkflowDispatch({
      owner: repo.owner.login,
      repo: repo.name,
      workflow_id: 'build-android.yml',
      ref: 'main',
      inputs: {
        html_url: `https://raw.githubusercontent.com/${repo.owner.login}/${repo.name}/main/www/index.html`
      }
    });
  }

  async waitForRelease(repo) {
    // Wait for the release to be created
    let release;
    while (!release) {
      try {
        const { data: releases } = await this.octokit.repos.listReleases({
          owner: repo.owner.login,
          repo: repo.name
        });
        
        if (releases.length > 0) {
          release = releases[0];
        }
      } catch (error) {
        // Ignore error and continue polling
      }
      
      if (!release) {
        // Wait for 10 seconds before polling again
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
    }
    
    return release;
  }

  async deleteTemporaryRepo(repo) {
    // Delete the temporary repository
    await this.octokit.repos.delete({
      owner: repo.owner.login,
      repo: repo.name
    });
  }

  async packageToAndroid(htmlContent, githubToken) {
    try {
      // Create temporary repository
      const repo = await this.createTemporaryRepo();
      
      // Copy HTML to repository
      await this.copyHtmlToRepo(htmlContent, repo);
      
      // Trigger workflow
      await this.triggerWorkflow(repo);
      
      // Wait for release
      const release = await this.waitForRelease(repo);
      
      // Get download URL
      const downloadUrl = release.assets[0].browser_download_url;
      
      // Delete temporary repository
      await this.deleteTemporaryRepo(repo);
      
      return downloadUrl;
    } catch (error) {
      console.error('Error packaging to Android:', error);
      throw error;
    }
  }
}

module.exports = AndroidPackager;