import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import {
  fetchAdminEvents,
  createAdminEvent,
  updateAdminEvent,
  deleteAdminEvent,
  uploadEventPoster,
  uploadEventPhotos,
  fetchEventPhotos,
  deleteEventPhoto,
  type AdminEvent,
  type AdminEventCreatePayload,
  type AdminEventUpdatePayload,
  type AdminEventPhoto,
} from '../api/admin';
import styles from './AdminEventsPanel.module.css';

type LoadState = 'idle' | 'loading' | 'error';

type EventFormData = {
  title: string;
  description: string;
  start_date: string;
  is_published: boolean;
};

const emptyForm: EventFormData = {
  title: '',
  description: '',
  start_date: '',
  is_published: false,
};

function formatDateForInput(dateStr: string | null): string {
  if (!dateStr) return '';
  return dateStr.slice(0, 10); // "YYYY-MM-DD"
}

function formatDateDisplay(dateStr: string | null): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function AdminEventsPanel() {
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('idle');
  const [error, setError] = useState('');

  // Modal state
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
  const [editingEvent, setEditingEvent] = useState<AdminEvent | null>(null);
  const [form, setForm] = useState<EventFormData>(emptyForm);
  const [posterFile, setPosterFile] = useState<File | null>(null);
  const [posterPreview, setPosterPreview] = useState<string | null>(null);
  const [removePoster, setRemovePoster] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');

  // Photos state (for edit modal)
  const [eventPhotos, setEventPhotos] = useState<AdminEventPhoto[]>([]);
  const [photosLoading, setPhotosLoading] = useState(false);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);

  const loadEvents = useCallback(async () => {
    setLoadState('loading');
    setError('');
    try {
      const data = await fetchAdminEvents();
      setEvents(data);
      setLoadState('idle');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load events');
      setLoadState('error');
    }
  }, []);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const openCreate = () => {
    setForm(emptyForm);
    setPosterFile(null);
    setPosterPreview(null);
    setRemovePoster(false);
    setEditingEvent(null);
    setEventPhotos([]);
    setPhotoFiles([]);
    setFeedback('');
    setModalMode('create');
  };

  const openEdit = async (event: AdminEvent) => {
    setEditingEvent(event);
    setForm({
      title: event.title,
      description: event.description || '',
      start_date: formatDateForInput(event.start_date),
      is_published: event.is_published ?? false,
    });
    setPosterFile(null);
    setPosterPreview(event.image_url || null);
    setRemovePoster(false);
    setPhotoFiles([]);
    setFeedback('');
    setModalMode('edit');

    // Load existing photos
    setPhotosLoading(true);
    try {
      const photos = await fetchEventPhotos(event.event_id);
      setEventPhotos(photos);
    } catch {
      setEventPhotos([]);
    } finally {
      setPhotosLoading(false);
    }
  };

  const closeModal = () => {
    setModalMode(null);
    setEditingEvent(null);
    setFeedback('');
  };

  const handleFormChange = (field: keyof EventFormData, value: string | boolean) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handlePosterSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPosterFile(file);
    setPosterPreview(URL.createObjectURL(file));
    setRemovePoster(false);
  };

  const handleRemovePoster = () => {
    setPosterFile(null);
    setPosterPreview(null);
    setRemovePoster(true);
  };

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    setPhotoFiles(prev => [...prev, ...Array.from(files)]);
  };

  const buildPayload = (): AdminEventCreatePayload => {
    return {
      title: form.title,
      description: form.description || undefined,
      start_date: form.start_date,
      is_published: form.is_published,
    };
  };

  const handleSave = async () => {
    setSaving(true);
    setFeedback('');
    try {
      let eventId: number;
      const payload = buildPayload();

      if (modalMode === 'create') {
        const created = await createAdminEvent(payload);
        eventId = created.event_id;
      } else if (editingEvent) {
        // If poster was removed (and no new file selected), set image_url to null
        const updatePayload: AdminEventUpdatePayload = removePoster && !posterFile
          ? { ...payload, image_url: null }
          : payload;
        await updateAdminEvent(editingEvent.event_id, updatePayload);
        eventId = editingEvent.event_id;
      } else {
        return;
      }

      // Upload poster if selected
      if (posterFile) {
        await uploadEventPoster(eventId, posterFile);
      }

      // Upload new photos/videos if selected
      if (photoFiles.length > 0) {
        await uploadEventPhotos(eventId, photoFiles);
      }

      await loadEvents();
      closeModal();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (eventId: number) => {
    if (!window.confirm('Delete this event? This will also remove all photos.')) return;
    try {
      await deleteAdminEvent(eventId);
      setEvents(prev => prev.filter(e => e.event_id !== eventId));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const handleTogglePublish = async (event: AdminEvent) => {
    try {
      const updated = await updateAdminEvent(event.event_id, {
        is_published: !event.is_published,
      });
      setEvents(prev =>
        prev.map(e => (e.event_id === updated.event_id ? updated : e)),
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Update failed');
    }
  };

  const handleDeletePhoto = async (photoId: number) => {
    try {
      await deleteEventPhoto(photoId);
      setEventPhotos(prev => prev.filter(p => p.id !== photoId));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete photo');
    }
  };

  const handleUploadNewPhotos = async () => {
    if (!editingEvent || photoFiles.length === 0) return;
    setUploadingPhotos(true);
    try {
      const newPhotos = await uploadEventPhotos(editingEvent.event_id, photoFiles);
      setEventPhotos(prev => [...prev, ...newPhotos]);
      setPhotoFiles([]);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploadingPhotos(false);
    }
  };

  const isPast = (event: AdminEvent) => new Date(event.end_date) < new Date();

  if (loadState === 'loading' && events.length === 0) {
    return (
      <div className={styles.page}>
        <div className={styles.container}>
          <div className={styles.loading}>
            <div className={styles.spinner} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <Link to="/admin" className={styles.backLink}>
          &larr; Back to Dashboard
        </Link>

        <div className={styles.header}>
          <h1>Events Management</h1>
          <button className={styles.createButton} onClick={openCreate}>
            + New Event
          </button>
        </div>

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.panel}>
          {events.length === 0 ? (
            <div className={styles.emptyState}>
              <p>No events yet. Create your first event above.</p>
            </div>
          ) : (
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Poster</th>
                    <th>Title</th>
                    <th>Event Date</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map(event => (
                    <tr key={event.event_id}>
                      <td>
                        {event.image_url ? (
                          <img src={event.image_url} alt="" className={styles.posterThumb} />
                        ) : (
                          <div className={styles.posterPlaceholder}>
                            {event.title.charAt(0)}
                          </div>
                        )}
                      </td>
                      <td>
                        <div className={styles.eventTitle}>{event.title}</div>
                        {event.description && (
                          <div className={styles.eventDesc}>{event.description}</div>
                        )}
                      </td>
                      <td>{formatDateDisplay(event.start_date)}</td>
                      <td>
                        {isPast(event) ? (
                          <span className={`${styles.badge} ${styles.badgePast}`}>Completed</span>
                        ) : event.is_published ? (
                          <span className={`${styles.badge} ${styles.badgePublished}`}>Published</span>
                        ) : (
                          <span className={`${styles.badge} ${styles.badgeDraft}`}>Draft</span>
                        )}
                      </td>
                      <td>
                        <div className={styles.actionButtons}>
                          <button
                            className={`${styles.actionButton} ${styles.editButton}`}
                            onClick={() => openEdit(event)}
                          >
                            Edit
                          </button>
                          {!isPast(event) && (
                            <button
                              className={`${styles.actionButton} ${styles.toggleButton}`}
                              onClick={() => handleTogglePublish(event)}
                            >
                              {event.is_published ? 'Unpublish' : 'Publish'}
                            </button>
                          )}
                          <button
                            className={`${styles.actionButton} ${styles.deleteButton}`}
                            onClick={() => handleDelete(event.event_id)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Create / Edit Modal */}
      {modalMode && (
        <div className={styles.modalOverlay} onClick={e => { if (e.target === e.currentTarget) closeModal(); }}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <h3>{modalMode === 'create' ? 'Create Event' : 'Edit Event'}</h3>
              <button className={styles.closeButton} onClick={closeModal}>
                &times;
              </button>
            </div>

            <div className={styles.modalBody}>
              <div className={styles.formGroup}>
                <label>Title</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={e => handleFormChange('title', e.target.value)}
                  placeholder="Event title"
                />
              </div>

              <div className={styles.formGroup}>
                <label>Description</label>
                <textarea
                  value={form.description}
                  onChange={e => handleFormChange('description', e.target.value)}
                  placeholder="Event description..."
                />
              </div>

              <div className={styles.formGroup}>
                <label>Event Date</label>
                <input
                  type="date"
                  value={form.start_date}
                  onChange={e => handleFormChange('start_date', e.target.value)}
                />
              </div>

              <div className={styles.checkboxGroup}>
                <input
                  type="checkbox"
                  id="is_published"
                  checked={form.is_published}
                  onChange={e => handleFormChange('is_published', e.target.checked)}
                />
                <label htmlFor="is_published">Published (visible on public events page)</label>
              </div>

              {/* Poster Upload */}
              <div className={styles.posterUpload}>
                <label>Event Poster</label>
                <input type="file" accept="image/*" onChange={handlePosterSelect} />
                {posterPreview && (
                  <div className={styles.posterPreviewWrapper}>
                    <img src={posterPreview} alt="Poster preview" className={styles.posterPreview} />
                    <button
                      type="button"
                      className={styles.removePosterButton}
                      onClick={handleRemovePoster}
                    >
                      Remove Poster
                    </button>
                  </div>
                )}
              </div>

              {/* Photo & Video Management */}
              <div className={styles.photoSection}>
                <h4>Event Photos &amp; Videos</h4>

                {/* Existing photos/videos (edit mode) */}
                {modalMode === 'edit' && (
                  photosLoading ? (
                    <div className={styles.loading}>
                      <div className={styles.spinner} />
                    </div>
                  ) : eventPhotos.length > 0 ? (
                    <div className={styles.photoGrid}>
                      {eventPhotos.map(photo => (
                        <div key={photo.id} className={styles.photoItem}>
                          {photo.mediaType === 'video' ? (
                            <>
                              <video src={photo.url} className={styles.videoThumb} muted preload="metadata" />
                              <span className={styles.videoIndicator}>VIDEO</span>
                            </>
                          ) : (
                            <img src={photo.url} alt={photo.caption || 'Event photo'} />
                          )}
                          <button
                            className={styles.photoDeleteButton}
                            onClick={() => handleDeletePhoto(photo.id)}
                            title="Delete"
                          >
                            &times;
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className={styles.noPhotos}>No photos or videos uploaded yet.</p>
                  )
                )}

                {/* Selected files preview */}
                {photoFiles.length > 0 && (
                  <div className={styles.selectedFilesGrid}>
                    {photoFiles.map((file, idx) => (
                      <div key={`${file.name}-${idx}`} className={styles.photoItem}>
                        {file.type.startsWith('video/') ? (
                          <>
                            <video
                              src={URL.createObjectURL(file)}
                              className={styles.videoThumb}
                              muted
                              preload="metadata"
                            />
                            <span className={styles.videoIndicator}>VIDEO</span>
                          </>
                        ) : (
                          <img src={URL.createObjectURL(file)} alt={file.name} />
                        )}
                        <button
                          className={styles.photoDeleteButton}
                          onClick={() => setPhotoFiles(prev => prev.filter((_, i) => i !== idx))}
                          title="Remove"
                        >
                          &times;
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className={styles.photoUploadRow}>
                  <input type="file" accept="image/*,video/*" multiple onChange={handlePhotoSelect} />
                  {modalMode === 'edit' && photoFiles.length > 0 && (
                    <>
                      <span>{photoFiles.length} file(s) selected</span>
                      <button
                        className={styles.uploadButton}
                        onClick={handleUploadNewPhotos}
                        disabled={uploadingPhotos}
                      >
                        {uploadingPhotos ? 'Uploading...' : 'Upload Now'}
                      </button>
                    </>
                  )}
                  {modalMode === 'create' && photoFiles.length > 0 && (
                    <span>{photoFiles.length} file(s) will be uploaded on save</span>
                  )}
                </div>
              </div>

              {feedback && <p className={styles.error}>{feedback}</p>}
            </div>

            <div className={styles.modalFooter}>
              <button className={styles.cancelButton} onClick={closeModal}>
                Cancel
              </button>
              <button
                className={styles.saveButton}
                onClick={handleSave}
                disabled={saving || !form.title || !form.start_date}
              >
                {saving ? 'Saving...' : modalMode === 'create' ? 'Create Event' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
