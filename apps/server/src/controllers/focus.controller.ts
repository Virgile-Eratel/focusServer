import type {
  FocusStatusResponse,
  DomainsResponse,
  AddDomainRequest,
  AddDomainResponse,
  RemoveDomainResponse,
  DomainEntriesResponse,
  ClassifyRequest,
  ClassifyResponse,
  DeleteVerdictResponse,
  RecentVerdictsResponse,
} from '@focus/shared';
import { isCategory } from '@focus/shared';
import { getStatusService } from '../services/focus.service';
import {
  getExpandedDomains,
  getBlockedHostnames,
  getDomainEntries,
  addDomain as addDomainService,
  removeDomain as removeDomainService,
  overrideAiDomain as overrideAiDomainService,
} from '../services/domain.service';
import { classifyUrl } from '../services/classifier.service';
import { deleteVerdict as deleteVerdictService, listRecentVerdicts } from '../services/verdict.service';
import { getRegistrableDomain } from '../utils/registrableDomain';
import { getCategoryStates } from '../config/categories';
import type { Request, Response } from 'express';

export const getStatus = async (_req: Request, res: Response) => {
  try {
    const status = getStatusService();
    // Une seule évaluation de la pause pour toute la réponse : `categories`
    // et `blockedDomains` ne peuvent pas se contredire à cheval sur une bascule.
    const response: FocusStatusResponse = {
      ...status,
      categories: getCategoryStates(status.isScheduledPause, status.nextTransition),
      blockedDomains: getBlockedHostnames(status.isScheduledPause),
    };
    res.status(200).json(response);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getDomains = async (_req: Request, res: Response) => {
  try {
    const domains = getExpandedDomains();
    res.status(200).json({ domains } as DomainsResponse);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getDomainEntriesController = async (_req: Request, res: Response) => {
  try {
    const entries = getDomainEntries();
    res.status(200).json({ entries } as DomainEntriesResponse);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const addDomain = async (req: Request, res: Response) => {
  try {
    const { domain, category } = req.body as AddDomainRequest;
    if (!domain || typeof domain !== 'string') {
      res.status(400).json({ error: 'Missing or invalid domain field' });
      return;
    }
    if (category !== undefined && !isCategory(category)) {
      res.status(400).json({ error: 'Invalid category field' });
      return;
    }

    const result = await addDomainService(domain, category);
    res.status(201).json({
      success: true,
      entry: result.entry,
      expandedDomains: result.expandedDomains,
    } as AddDomainResponse);
  } catch (error) {
    const e = error as Error & { statusCode?: number };
    const status = e.statusCode || 500;
    res.status(status).json({ error: e.message });
  }
};

/**
 * PUT /domains/:domain — corriger une erreur de l'IA (et rien d'autre : les
 * verrous sont dans `overrideAiDomain`). Le verdict est effacé dans la foulée,
 * sans quoi il resterait en base à contredire la correction humaine.
 */
export const overrideDomain = async (req: Request, res: Response) => {
  try {
    const { domain } = req.params;
    const { category } = req.body as AddDomainRequest;
    if (!domain) {
      res.status(400).json({ error: 'Missing domain parameter' });
      return;
    }
    if (!isCategory(category)) {
      res.status(400).json({ error: 'Invalid category field' });
      return;
    }

    const result = await overrideAiDomainService(domain, category);
    deleteVerdictService(result.entry.domain);

    res.status(200).json({
      success: true,
      entry: result.entry,
      expandedDomains: result.expandedDomains,
    } as AddDomainResponse);
  } catch (error) {
    const e = error as Error & { statusCode?: number };
    const status = e.statusCode || 500;
    res.status(status).json({ error: e.message });
  }
};

export const removeDomain = async (req: Request, res: Response) => {
  try {
    const { domain } = req.params;
    if (!domain) {
      res.status(400).json({ error: 'Missing domain parameter' });
      return;
    }

    const result = await removeDomainService(domain);
    res.status(200).json({
      success: true,
      expandedDomains: result.expandedDomains,
    } as RemoveDomainResponse);
  } catch (error) {
    const e = error as Error & { statusCode?: number };
    const status = e.statusCode || 500;
    res.status(status).json({ error: e.message });
  }
};

export const classify = async (req: Request, res: Response) => {
  try {
    const { url } = req.body as ClassifyRequest;
    if (!url || typeof url !== 'string') {
      res.status(400).json({ error: 'Missing or invalid url field' });
      return;
    }

    const outcome = await classifyUrl(url);
    res.status(200).json(outcome satisfies ClassifyResponse);
  } catch (error) {
    const e = error as Error & { statusCode?: number };
    const status = e.statusCode || 500;
    res.status(status).json({ error: e.message });
  }
};

export const getRecentVerdicts = async (req: Request, res: Response) => {
  try {
    const rawLimit = Number(req.query.limit);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), 500) : 50;
    const verdicts = listRecentVerdicts(limit);
    res.status(200).json({ verdicts } satisfies RecentVerdictsResponse);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Effacer un verdict ne retire PAS l'entrée domains.json qui en a découlé :
 * annuler un faux positif = DELETE /verdicts/:d PUIS DELETE /domains/:d —
 * la seconde reste une action humaine (spec §3.3).
 */
export const deleteVerdictController = async (req: Request, res: Response) => {
  try {
    const domain = getRegistrableDomain(req.params.domain ?? '');
    if (!domain) {
      res.status(400).json({ error: 'Invalid domain parameter' });
      return;
    }

    if (!deleteVerdictService(domain)) {
      res.status(404).json({ error: 'Verdict not found' });
      return;
    }
    res.status(200).json({ success: true } satisfies DeleteVerdictResponse);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};
