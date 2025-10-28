// Template Service
// Handles template CRUD operations matching web app pattern

class TemplateService {
  /**
   * Get all templates for the authenticated user
   * Matches: GET /api/v1/templates
   * @returns {Promise<{success: boolean, templates?: array, error?: string}>}
   */
  static async getTemplates() {
    try {
      console.log('📋 Fetching user templates...');

      const authHeaders = await TokenManager.getAuthHeaders();

      const response = await fetch(
        `${CONFIG.API_BASE_URL}${CONFIG.ENDPOINTS.TEMPLATES}`,
        {
          method: 'GET',
          headers: authHeaders
        }
      );

      const data = await response.json();

      if (!response.ok) {
        console.error('❌ Failed to fetch templates:', data.error);
        return {
          success: false,
          error: data.error || 'Failed to fetch templates'
        };
      }

      console.log('✅ Templates fetched:', data.data?.templates?.length || 0);

      return {
        success: true,
        templates: data.data?.templates || []
      };

    } catch (error) {
      console.error('❌ Get templates error:', error);
      return {
        success: false,
        error: error.message || 'Network error'
      };
    }
  }

  /**
   * Get a specific template by ID
   * Matches: GET /api/v1/templates/:id
   * @param {string} templateId
   * @returns {Promise<{success: boolean, template?: object, error?: string}>}
   */
  static async getTemplateById(templateId) {
    try {
      console.log('📋 Fetching template:', templateId);

      const authHeaders = await TokenManager.getAuthHeaders();

      const response = await fetch(
        `${CONFIG.API_BASE_URL}${CONFIG.ENDPOINTS.TEMPLATE_BY_ID(templateId)}`,
        {
          method: 'GET',
          headers: authHeaders
        }
      );

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: data.error || 'Failed to fetch template'
        };
      }

      return {
        success: true,
        template: data.data
      };

    } catch (error) {
      console.error('❌ Get template error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Create a new template
   * Matches: POST /api/v1/templates
   * @param {object} templateData - { name, prompt, description?, category? }
   * @returns {Promise<{success: boolean, template?: object, error?: string}>}
   */
  static async createTemplate(templateData) {
    try {
      console.log('📝 Creating template:', templateData.name);

      const authHeaders = await TokenManager.getAuthHeaders();

      const response = await fetch(
        `${CONFIG.API_BASE_URL}${CONFIG.ENDPOINTS.TEMPLATES}`,
        {
          method: 'POST',
          headers: {
            ...authHeaders,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            name: templateData.name,
            prompt: templateData.prompt,
            description: templateData.description || '',
            category: templateData.category || 'general',
            isActive: true
          })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        console.error('❌ Template creation failed:', data.error);
        return {
          success: false,
          error: data.error || 'Failed to create template'
        };
      }

      console.log('✅ Template created:', data.data.id);

      return {
        success: true,
        template: data.data
      };

    } catch (error) {
      console.error('❌ Create template error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Update a template
   * Matches: PUT /api/v1/templates/:id
   * @param {string} templateId
   * @param {object} updates - { name?, prompt?, description?, category?, isActive? }
   * @returns {Promise<{success: boolean, template?: object, error?: string}>}
   */
  static async updateTemplate(templateId, updates) {
    try {
      console.log('✏️ Updating template:', templateId);

      const authHeaders = await TokenManager.getAuthHeaders();

      const response = await fetch(
        `${CONFIG.API_BASE_URL}${CONFIG.ENDPOINTS.TEMPLATE_BY_ID(templateId)}`,
        {
          method: 'PUT',
          headers: {
            ...authHeaders,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(updates)
        }
      );

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: data.error || 'Failed to update template'
        };
      }

      return {
        success: true,
        template: data.data
      };

    } catch (error) {
      console.error('❌ Update template error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Delete a template
   * Matches: DELETE /api/v1/templates/:id
   * @param {string} templateId
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  static async deleteTemplate(templateId) {
    try {
      console.log('🗑️ Deleting template:', templateId);

      const authHeaders = await TokenManager.getAuthHeaders();

      const response = await fetch(
        `${CONFIG.API_BASE_URL}${CONFIG.ENDPOINTS.TEMPLATE_BY_ID(templateId)}`,
        {
          method: 'DELETE',
          headers: authHeaders
        }
      );

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: data.error || 'Failed to delete template'
        };
      }

      console.log('✅ Template deleted');

      return {
        success: true
      };

    } catch (error) {
      console.error('❌ Delete template error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Cache templates in chrome.storage for quick access
   * @param {array} templates
   */
  static async cacheTemplates(templates) {
    try {
      await chrome.storage.local.set({
        cachedTemplates: templates,
        templatesCachedAt: Date.now()
      });
      console.log('💾 Templates cached:', templates.length);
    } catch (error) {
      console.error('❌ Failed to cache templates:', error);
    }
  }

  /**
   * Get cached templates (5 minute TTL)
   * @returns {Promise<array|null>}
   */
  static async getCachedTemplates() {
    try {
      const result = await chrome.storage.local.get(['cachedTemplates', 'templatesCachedAt']);

      if (!result.cachedTemplates || !result.templatesCachedAt) {
        return null;
      }

      // Check if cache is still valid (5 minutes)
      const age = Date.now() - result.templatesCachedAt;
      if (age > 5 * 60 * 1000) {
        console.log('⏰ Template cache expired');
        return null;
      }

      console.log('💾 Using cached templates:', result.cachedTemplates.length);
      return result.cachedTemplates;

    } catch (error) {
      console.error('❌ Failed to get cached templates:', error);
      return null;
    }
  }

  /**
   * Get templates with caching
   * @param {boolean} forceRefresh - Skip cache and fetch from server
   * @returns {Promise<{success: boolean, templates?: array, error?: string}>}
   */
  static async getTemplatesWithCache(forceRefresh = false) {
    if (!forceRefresh) {
      const cached = await this.getCachedTemplates();
      if (cached) {
        return {
          success: true,
          templates: cached
        };
      }
    }

    const result = await this.getTemplates();

    if (result.success && result.templates) {
      await this.cacheTemplates(result.templates);
    }

    return result;
  }
}

// Make TemplateService available globally
if (typeof window !== 'undefined') {
  window.TemplateService = TemplateService;
}
