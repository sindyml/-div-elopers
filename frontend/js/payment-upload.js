/* ============================================================
   payment-upload.js — Firebase Storage Proof Upload Utility

   Reusable module for uploading payment proof files to
   Firebase Storage and recording them in Firestore.

   Agreed schema (Developer B creates):
     transactions/{txId}/proofs/{proofId}
     {
       uploadedBy:  string   (userId),
       fileUrl:     string   (Firebase Storage download URL),
       uploadedAt:  timestamp,
       verified:    boolean,
       verifiedBy:  string | null,
       verifiedAt:  timestamp | null,
     }

   Usage:
     import { uploadPaymentProof, validateProofFile } from './payment-upload.js';

     const err = validateProofFile(file);
     if (err) { showError(err); return; }

     const { fileUrl, proofId } = await uploadPaymentProof(file, txId, userId, {
       onProgress: (pct) => updateProgressBar(pct),
     });
   ============================================================ */

import { db } from './firebase-config.js';
import {
  collection,
  addDoc,
  getDocs,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import {
  getStorage,
  ref,
  uploadBytesResumable,
  getDownloadURL,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js';

/* ── Constants ─────────────────────────────────────────────── */
export const MAX_PROOF_SIZE      = 5 * 1024 * 1024; // 5 MB
export const ALLOWED_PROOF_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];

/* ── Validation ────────────────────────────────────────────── */

/**
 * Validate a proof file before uploading.
 * @param {File} file
 * @returns {string|null} Error message, or null if the file is valid.
 */
export function validateProofFile(file) {
  if (!file || !(file instanceof File)) {
    return 'No file selected.';
  }
  if (!ALLOWED_PROOF_TYPES.includes(file.type)) {
    return 'Invalid file type. Please upload a JPG, PNG, or PDF.';
  }
  if (file.size > MAX_PROOF_SIZE) {
    return `File is too large (${(file.size / (1024 * 1024)).toFixed(1)} MB). Maximum size is 5 MB.`;
  }
  return null;
}

/* ── Core Upload ───────────────────────────────────────────── */

/**
 * Upload a proof file to Firebase Storage and record it in Firestore.
 *
 * Storage path:  payment-proofs/{userId}/{txId}/{sanitised-filename}
 * Firestore doc: transactions/{txId}/proofs/{auto-id}
 *
 * @param {File}   file     Validated File object.
 * @param {string} txId     Firestore transaction document ID.
 * @param {string} userId   UID of the authenticated user.
 * @param {{ onProgress?: (pct: number) => void }} [options]
 * @returns {Promise<{ fileUrl: string, proofId: string }>}
 */
export async function uploadPaymentProof(file, txId, userId, { onProgress } = {}) {
  if (!file || !txId || !userId) {
    throw new Error('uploadPaymentProof: file, txId, and userId are required.');
  }

  const storage = getStorage();

  // Sanitise filename to prevent storage path traversal
  const safeName    = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const uniqueName  = `proof_${Date.now()}_${safeName}`;
  const storagePath = `payment-proofs/${userId}/${txId}/${uniqueName}`;
  const storageRef  = ref(storage, storagePath);

  const uploadTask = uploadBytesResumable(storageRef, file);

  const downloadUrl = await new Promise((resolve, reject) => {
    uploadTask.on(
      'state_changed',
      (snapshot) => {
        if (typeof onProgress === 'function') {
          const pct = Math.round(
            (snapshot.bytesTransferred / snapshot.totalBytes) * 100
          );
          onProgress(pct);
        }
      },
      reject,
      async () => {
        try {
          resolve(await getDownloadURL(storageRef));
        } catch (err) {
          reject(err);
        }
      }
    );
  });

  // Write proof document to Firestore subcollection
  const proofRef = await addDoc(
    collection(db, 'transactions', txId, 'proofs'),
    {
      uploadedBy: userId,
      fileUrl:    downloadUrl,
      uploadedAt: serverTimestamp(),
      verified:   false,
      verifiedBy: null,
      verifiedAt: null,
    }
  );

  return { fileUrl: downloadUrl, proofId: proofRef.id };
}

/* ── Fetch Existing Proofs ─────────────────────────────────── */

/**
 * Fetch all previously uploaded proofs for a transaction.
 * @param {string} txId  Firestore transaction document ID.
 * @returns {Promise<Array<{ id: string, fileUrl: string, uploadedAt: any,
 *                           verified: boolean, verifiedBy: string|null }>>}
 */
export async function getProofsForTransaction(txId) {
  if (!txId) return [];
  try {
    const snap = await getDocs(
      collection(db, 'transactions', txId, 'proofs')
    );
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (_) {
    // Subcollection or parent may not exist yet
    return [];
  }
}
