import type {
  FocusStatusResponse,
  DomainsResponse,
  AddDomainRequest,
  AddDomainResponse,
  RemoveDomainResponse,
  DomainEntriesResponse,
} from '@focus/shared';
import { getStatusService } from '../services/focus.service';
import {
  getExpandedDomains,
  getDomainEntries,
  addDomain as addDomainService,
  removeDomain as removeDomainService,
} from '../services/domain.service';
import type { Request, Response } from 'express';

export const getStatus = async (_req: Request, res: Response) => {
  try {
    const status = await getStatusService();
    res.status(200).json(status as FocusStatusResponse);
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
    const { domain, tags } = req.body as AddDomainRequest;
    if (!domain || typeof domain !== 'string') {
      res.status(400).json({ error: 'Missing or invalid domain field' });
      return;
    }

    const result = await addDomainService(domain, tags);
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
