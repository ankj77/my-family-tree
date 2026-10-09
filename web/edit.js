(function (edit) {
  var LABELS = {
    name: 'Name', name_hi: 'Hindi name', gender: 'Gender', life: 'Living or deceased',
    born: 'Born', died: 'Died', status: 'Name status', sort_order: 'Order among brothers and sisters',
    address_line: 'Address', address_locality: 'Locality', address_city: 'City',
    address_state: 'State', address_country: 'Country', origin_village_id: 'Home village',
    father_name: 'Father (name only)',
    mother_name: 'Mother (name only)', note: 'Note', family_id: 'Born in family',
    father_id: 'Father', mother_id: 'Mother'
  };
  var CHOICES = {
    gender: [['', '—'], ['male', 'Male'], ['female', 'Female']],
    life: [['living', 'Living'], ['deceased', 'Deceased']],
    status: [['', '—'], ['uncertain', 'Name uncertain'], ['needs-parent', 'Parent not known'], ['gap', 'Unknown generation']]
  };
  var EDIT_MOVE = ['father_id', 'mother_id', 'family_id'];
  var EDIT_ALL = ['name', 'name_hi', 'gender', 'life', 'born', 'died', 'status', 'sort_order',
    'address_line', 'address_locality', 'address_city', 'address_state', 'address_country',
    'origin_village_id', 'father_name', 'mother_name', 'note'];
  var NEW_CHILD = EDIT_ALL.filter(function (n) { return n !== 'father_name' && n !== 'mother_name'; });
  var NEW_SPOUSE = EDIT_ALL.concat(['family_id']);

  edit.editNames = function (canMove) {
    return canMove ? EDIT_ALL.concat(EDIT_MOVE) : EDIT_ALL.slice();
  };

  function esc(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  edit.esc = esc;

  edit.actionsFor = function (p, hasSpouse) {
    var out = [];
    if (p.can_edit) {
      out.push('edit', 'child');
      if (!hasSpouse) out.push('spouse');
    }
    if (p.delete_pending) out.push('pending');
    else if (p.can_delete === 'direct') out.push('delete');
    else if (p.can_delete === 'request') out.push('request');
    else if (p.can_edit && p.delete_reason) out.push('blocked');
    return out;
  };

  edit.payload = function (pairs) {
    var out = {};
    pairs.forEach(function (pair) {
      var value = String(pair[1]).trim();
      if (pair[0] === 'sort_order') out[pair[0]] = value === '' ? null : Number(value);
      else out[pair[0]] = value === '' ? null : value;
    });
    return out;
  };

  edit.changes = function (original, values) {
    var out = {};
    Object.keys(values).forEach(function (k) {
      var before = original[k] === undefined ? null : original[k];
      if (before !== values[k]) out[k] = values[k];
    });
    return out;
  };

  function nameOf(p) { return p.name || p.name_hi || p.id; }

  function spouseLabel(p) {
    return p.gender === 'female' ? 'Add husband' : p.gender === 'male' ? 'Add wife' : 'Add spouse';
  }

  function field(name, value, options) {
    var v = value === null || value === undefined ? '' : value;
    var choices = options[name] || CHOICES[name];
    var label = '<label>' + esc(LABELS[name] || name);
    if (choices) {
      return label + '<select name="' + name + '">' + choices.map(function (c) {
        return '<option value="' + esc(c[0]) + '"' + (String(c[0]) === String(v) ? ' selected' : '') + '>' +
          esc(c[1]) + '</option>';
      }).join('') + '</select></label>';
    }
    if (name === 'note') return label + '<textarea name="note" rows="3">' + esc(v) + '</textarea></label>';
    return label + '<input type="' + (name === 'sort_order' ? 'number' : 'text') + '" name="' + name +
      '" value="' + esc(v) + '"></label>';
  }

  function formHtml(title, names, values, options, submit) {
    return '<h3>' + esc(title) + '</h3><form class="edit-form">' +
      names.map(function (n) { return field(n, values[n], options); }).join('') +
      '<div class="form-buttons"><button type="submit">' + esc(submit) + '</button>' +
      '<button type="button" data-cancel>Cancel</button></div><p class="form-msg" role="alert"></p></form>';
  }

  function readForm(form) {
    var pairs = [];
    Array.prototype.forEach.call(form.elements, function (el) { if (el.name) pairs.push([el.name, el.value]); });
    return edit.payload(pairs);
  }

  function openForm(body, html, onSubmit, onCancel) {
    body.innerHTML = html;
    var form = body.querySelector('form');
    form.querySelector('[data-cancel]').addEventListener('click', onCancel);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var msg = form.querySelector('.form-msg');
      var submit = form.querySelector('button[type=submit]');
      msg.textContent = 'Saving…';
      submit.disabled = true;
      onSubmit(readForm(form)).catch(function (err) {
        submit.disabled = false;
        msg.textContent = err.message;
      });
    });
    var first = form.querySelector('input,select,textarea');
    if (first) first.focus();
  }

  function familyOptions() {
    var out = [['', 'Not recorded']];
    (FT.api.villages || []).forEach(function (v) {
      v.families.forEach(function (f) { out.push([f.id, f.name + ' (' + v.name + ')']); });
    });
    return out;
  }

  edit.villageOptions = function (villages) {
    return [['', 'Not recorded']].concat(villages.map(function (v) {
      var where = [v.district, v.state].filter(Boolean).join(', ');
      return [v.id, where ? v.name + ' (' + where + ')' : v.name];
    }).sort(function (a, b) { return a[1].localeCompare(b[1]); }));
  };

  function peopleOptions(people, skip) {
    return [['', '—']].concat(people.filter(function (p) { return p.id !== skip; }).map(function (p) {
      return [p.id, nameOf(p)];
    }).sort(function (a, b) { return a[1].localeCompare(b[1]); }));
  }

  function confirmBox(body, text, yesLabel, onYes) {
    var box = body.querySelector('.sheet-actions');
    box.innerHTML = '<p class="sheet-why">' + esc(text) + '</p>' +
      '<button type="button" data-yes>' + esc(yesLabel) + '</button>' +
      '<button type="button" data-no>Cancel</button><p class="form-msg" role="alert"></p>';
    box.querySelector('[data-yes]').addEventListener('click', function () {
      var yes = this;
      yes.disabled = true;
      onYes().catch(function (err) {
        yes.disabled = false;
        box.querySelector('.form-msg').textContent = err.message;
      });
    });
    return box.querySelector('[data-no]');
  }

  function act(kind, person, node, body) {
    var api = FT.api;
    var back = function () { FT.select(person.id, node); };
    var path = '/people/' + encodeURIComponent(person.id);
    if (kind === 'edit') {
      var load = person.can_move ? api.call('GET', '/people') : Promise.resolve(null);
      load.then(function (people) {
        var names = edit.editNames(!!people);
        var options = { origin_village_id: edit.villageOptions(api.villages || []) };
        if (people) {
          options.father_id = options.mother_id = peopleOptions(people, person.id);
          options.family_id = familyOptions();
        }
        openForm(body, formHtml('Edit ' + nameOf(person), names, person.edit || {}, options, 'Save'), function (values) {
          var diff = edit.changes(person.edit || {}, values);
          if (!Object.keys(diff).length) { back(); return Promise.resolve(); }
          return api.call('PATCH', path, diff).then(function () { api.reloadAt(person.id); });
        }, back);
      }, function (err) { body.insertAdjacentHTML('beforeend', '<p class="form-msg">' + esc(err.message) + '</p>'); });
    } else if (kind === 'child') {
      openForm(body, formHtml('Add a child of ' + nameOf(person), NEW_CHILD, { life: 'living' },
        { origin_village_id: edit.villageOptions(api.villages || []) }, 'Add'), function (values) {
        return api.call('POST', '/people', Object.assign({ as: 'child', parent_id: person.id }, values))
          .then(function (r) { api.reloadAt(r.id); });
      }, back);
    } else if (kind === 'spouse') {
      var gender = person.gender === 'male' ? 'female' : person.gender === 'female' ? 'male' : '';
      openForm(body, formHtml(spouseLabel(person) + ' for ' + nameOf(person), NEW_SPOUSE,
        { gender: gender, life: 'living' }, { family_id: familyOptions(), origin_village_id: edit.villageOptions(api.villages || []) }, 'Add'), function (values) {
        return api.call('POST', '/people', Object.assign({ as: 'spouse', spouse_id: person.id }, values))
          .then(function (r) { api.reloadAt(r.id); });
      }, back);
    } else if (kind === 'delete' || kind === 'request') {
      var stay = person === node ? (FT.parentOf[node.id] || {}).id : node.id;
      var text = kind === 'delete' ? 'Delete ' + nameOf(person) + '? This cannot be undone.'
        : 'Ask an admin to delete ' + nameOf(person) + '?';
      var no = confirmBox(body, text, kind === 'delete' ? 'Yes, delete' : 'Send request', function () {
        return api.call('DELETE', path).then(function (r) {
          api.reloadAt(r.status === 'requested' ? person.id : stay);
        });
      });
      no.addEventListener('click', back);
    }
  }

  function buttonHtml(kind, person) {
    if (kind === 'pending') return '<button type="button" disabled>Deletion pending</button>';
    if (kind === 'blocked') {
      return '<button type="button" disabled title="' + esc(person.delete_reason) + '">Delete</button>' +
        '<p class="sheet-why">' + esc(person.delete_reason) + '</p>';
    }
    var labels = { edit: 'Edit', child: 'Add child', spouse: spouseLabel(person), 'delete': 'Delete', request: 'Request delete' };
    return '<button type="button" data-act="' + kind + '">' + esc(labels[kind]) + '</button>';
  }

  edit.onSheet = function (person, node, body) {
    var hasSpouse = person !== node || (node.spouses || []).length > 0;
    var html = '';
    var links = (person.links || []).filter(function (l) { return l.family_id !== FT.api.familyId; });
    if (links.length) {
      html += '<div class="sheet-links">' + links.map(function (l) {
        return '<a href="' + esc(FT.api.urlFor(l.family_id, person.id)) + '">' + esc(l.text) + ' →</a>';
      }).join('') + '</div>';
    }
    var actions = edit.actionsFor(person, hasSpouse);
    if (actions.length) {
      html += '<div class="sheet-actions">' + actions.map(function (a) { return buttonHtml(a, person); }).join('') + '</div>';
    }
    if (!html) return;
    body.insertAdjacentHTML('beforeend', html);
    Array.prototype.forEach.call(body.querySelectorAll('[data-act]'), function (b) {
      b.addEventListener('click', function () { act(b.getAttribute('data-act'), person, node, body); });
    });
  };

  if (typeof FT !== 'undefined') FT.onSheet = edit.onSheet;
})(typeof FT !== 'undefined' ? (FT.edit = {}) : module.exports);
